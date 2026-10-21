import { randomInt, randomUUID } from 'node:crypto';
import { Game } from '../src/engine.js';
import { FixedStepLoop } from '../src/loop.js';
import { pilotInput } from '../src/pilot.js';
import { policyInput, seededRandom, eventReward, withRules, aimedEnemy } from '../agents/policy.mjs';
import { readJSON } from './store.mjs';
import { join } from 'node:path';
export class RequestError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export function validateAction(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError('Action must be an object');
  const result = {};
  for (const key of ['left','right','fire','dodge']) if (key in value) {
    if (typeof value[key] !== 'boolean') throw new RequestError(`${key} must be boolean`); result[key] = value[key];
  }
  if ('targetX' in value) {
    if (!Number.isFinite(value.targetX) || value.targetX < 32 || value.targetX > 928) throw new RequestError('targetX must be between 32 and 928'); result.targetX = value.targetX;
  }
  if (!Object.keys(result).length) throw new RequestError('Action has no recognized controls');
  return result;
}
export class Room {
  // timeLimit is in game seconds; tests and benchmarks bound matches, a real arena plays until the game is lost.
  constructor({ store, ollama, now = () => performance.now(), timeLimit = Infinity }) {
    this.store = store; this.ollama = ollama; this.now = now; this.timeLimit = timeLimit; this.game = new Game(); this.game.events = [];
    this.mode = 'coop'; this.provider = 'heuristic'; this.leases = new Map(); this.commands = new Map();
    this.loop = new FixedStepLoop(); this.rewards = {player:0,wingman:0}; this.events = []; this.pendingEvents = [];
    this.lastRecordAt = 0; this.learning = { status:'idle' }; this.lastSummary = null; this.reflection = Promise.resolve();
  }
  role() { return this.mode === 'coop' ? 'wingman' : 'player'; }
  async start({ mode = 'coop' } = {}) {
    if (!['human','ai','coop'].includes(mode)) throw new RequestError('Invalid mode');
    await this.finish('restarted'); this.ollama.stop(); this.commands.clear(); this.loop.reset();
    if(mode!==this.mode || (mode==='ai' && this.leases.get('player')?.owner.startsWith('browser:')))this.leases.delete('player');
    this.mode = mode;
    this.seed = randomInt(1, 0x7fffffff); this.game = new Game(seededRandom(this.seed)); this.game.coop = mode === 'coop'; this.game.reset();
    this.rewards = {player:0,wingman:0}; this.startedAt = new Date().toISOString(); this.lastRecordAt = 0;
    this.trained = await readJSON(join(this.store.directory,'policy.json'), null);
    this.matchProvider = this.provider; this.matchModels = new Set();
    this.recording = this.store.begin({schema:1,seed:this.seed,mode,provider:this.provider,model:this.ollama.model,step:1/120,startedAt:this.startedAt});
    return this.snapshot();
  }
  configure({ provider, model } = {}) {
    if (!['heuristic','ollama','learned','external','none'].includes(provider)) throw new RequestError('Invalid provider');
    if (model !== undefined && (typeof model !== 'string' || !/^[a-zA-Z0-9._:/-]{1,120}$/.test(model))) throw new RequestError('Invalid model name');
    if (model && model !== this.ollama.model) { this.ollama.stop(); this.ollama.model = model; this.ollama.memory = null; this.ollama.init().catch(() => {}); }
    if (provider !== 'external' && this.leases.get(this.role())?.owner === 'external') { this.leases.delete(this.role()); this.commands.delete(this.role()); }
    this.provider = provider; this.ollama.stop(); this.commands.delete('builtin');
    this.recording?.write('provider', {time:this.game.time,provider,model:this.ollama.model});
    return this.agentInfo();
  }
  claim(role, name, owner = 'external', token) {
    if (!['player','wingman'].includes(role)) throw new RequestError('Role must be player or wingman');
    const current = this.leases.get(role), now = this.now();
    if (current && current.expires > now && current.token === token && current.owner === owner) {current.expires=now+10000;return {token:current.token,role,expiresInMs:10000};}
    if (current && current.expires > now && (current.owner !== owner || owner === 'external')) throw new RequestError('That ship already has a controller',409);
    const lease = {role,name:String(name || 'Agent').slice(0,60),owner,token:randomUUID(),expires:now + 10000};
    this.leases.set(role,lease);
    if (role === this.role() && owner === 'external') this.configure({provider:'external'});
    return {token:lease.token,role,expiresInMs:10000};
  }
  action({token,role,action,durationMs = 300}, owner) {
    const lease = this.leases.get(role), now = this.now();
    if (!lease || lease.token !== token || lease.expires <= now || (owner && lease.owner !== owner)) throw new RequestError('Controller lease expired or belongs to another ship',403);
    const command = validateAction(action);
    const max = 'targetX' in command ? 2000 : 500;
    if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > max) throw new RequestError(`durationMs must be between 0 and ${max}`);
    lease.expires = now + 10000; this.commands.set(role,{command,until:now+durationMs,source:lease.name});
    const serialized = JSON.stringify(command);
    if (serialized !== lease.lastAction || now - (lease.lastLog || 0) >= 250) { this.recording?.write('action',{time:this.game.time,role,source:lease.name,action:command,durationMs}); lease.lastAction = serialized; lease.lastLog = now; }
    return {ok:true,role,expiresInMs:10000};
  }
  release(token) { for (const [role,lease] of this.leases) if (lease.token === token) { this.leases.delete(role); this.commands.delete(role); } }
  releaseOwner(owner) { for (const [role,lease] of this.leases) if (lease.owner === owner) this.release(lease.token); }
  control(command) {
    if (command === 'pause' && this.game.state === 'playing') this.game.togglePause();
    else if (command === 'resume' && this.game.state === 'paused') this.game.togglePause();
    else if (!['pause','resume'].includes(command)) throw new RequestError('Unknown command');
    this.commands.clear(); this.loop.reset(); this.recording?.write('control',{time:this.game.time,command});
  }
  controls(role) {
    const ship = role === 'player' ? this.game.player : this.game.wingman;
    if (!ship || ship.lives <= 0) return {};
    const command = this.commands.get(role);
    // Agent and model targets steer through the best known reflexes.
    const reflex = withRules(this.trained?.params);
    if (command && command.until > this.now()) return 'targetX' in command.command ? policyInput(this.game,ship,reflex,command.command) : command.command;
    const autonomous = role === this.role() && this.mode !== 'human';
    if (!autonomous) return {};
    if (this.provider === 'none') return {};
    if (this.provider === 'learned') return policyInput(this.game,ship,reflex);
    if (this.provider === 'ollama') {
      const builtin = this.commands.get('builtin');
      if (builtin && builtin.until > this.now()) return policyInput(this.game,ship,reflex,builtin.command);
    }
    return pilotInput(this.game,ship);
  }
  advanceFrame(dt) {
      this.game.update(dt,this.controls('player'),this.controls('wingman'));
      for (const ship of this.game.ships) if (ship.lives > 0) this.rewards[ship.id] += .03 * dt;
      for (const event of this.game.events.splice(0)) {
        if (event.ship) this.rewards[event.ship] += eventReward(event);
        this.pendingEvents.push(event); this.recording?.write('event',{time:this.game.time,event});
      }

  }
  async step({token,role='player',action,frames=60}) {
    if (role !== 'player') throw new RequestError('Solo stepping controls the player ship');
    if (this.mode !== 'ai' || this.game.state !== 'paused') throw new RequestError('Stepping requires a paused solo AI mission',409);
    if (!Number.isInteger(frames) || frames < 1 || frames > 240) throw new RequestError('frames must be between 1 and 240');
    this.action({token,role,action,durationMs:'targetX' in (action || {}) ? 2000 : 500});
    this.recording?.write('step',{time:this.game.time,role,action,frames});
    this.commands.get(role).until=Infinity;
    this.game.state='playing';
    for(let i=0;i<frames && this.game.state==='playing';i++) this.advanceFrame(1/120);
    this.commands.delete(role);
    if(this.game.state==='playing')this.game.state='paused'; else await this.finish('game-over');
    this.recording?.write('state',{observation:this.observation()});
    this.loop.reset();return this.snapshot();
  }
  tick(timestamp = this.now()) {
    this.loop.advance(timestamp, dt => this.advanceFrame(dt), this.game.state === 'playing');
    if (this.game.state === 'playing' && this.provider === 'ollama' && this.mode !== 'human') {
      this.ollama.maybeDecide(this.observation(), (decided, seen) => {
        const command = {...decided, enemy:aimedEnemy(seen, decided.targetX, withRules(this.trained?.params))};
        this.matchModels.add(this.ollama.model);
        this.commands.set('builtin',{command,until:this.now()+8000,source:'ollama'});
        this.recording?.write('action',{time:this.game.time,role:this.role(),source:'ollama',action:command,durationMs:8000});
      });
    }
    if (this.game.time - this.lastRecordAt >= .2) { this.lastRecordAt = this.game.time; this.recording?.write('state',{observation:this.observation()}); }
    if (this.game.state === 'over') this.finish('game-over').catch(error => { this.storageError = error.message; });
    if (this.game.time >= this.timeLimit && this.game.state === 'playing') { this.game.state = 'over'; this.finish('time-limit').catch(error => {this.storageError = error.message;}); }
    if (this.pendingEvents.length > 100) this.pendingEvents.splice(0,this.pendingEvents.length-100);
  }
  observation() {
    const g = this.game;
    return {schema:1,matchId:this.recording?.id || this.lastSummary?.id || null,state:g.state,mode:this.mode,activeShip:this.role(),time:g.time,width:960,height:680,score:g.score,lives:g.lives,wave:g.wave,
      direction:g.direction,player:{...g.player},wingman:g.wingman ? {...g.wingman}:null,enemies:g.enemies.map(e=>({...e})),shots:g.shots.map(s=>({...s})),drops:g.drops.map(d=>({...d})),rewards:{...this.rewards}};
  }
  agentInfo() {
    const lease = this.leases.get(this.role());
    return {provider:this.provider,role:this.role(),controlSource:((this.commands.get(this.role())?.until || 0)>this.now())?'external':this.provider==='ollama'?((this.commands.get('builtin')?.until || 0)>this.now()?'ollama':'local-fallback'):this.provider,external:lease && lease.expires > this.now() ? {name:lease.name,connected:true,commandFresh:(this.commands.get(this.role())?.until || 0)>this.now()}:null,
      ollama:this.ollama.info(),learned:this.trained ? {episodes:this.trained.episodes,generation:this.trained.generation ?? null,level:this.trained.benchmarkLevel ?? null}:null,learning:this.learning,storageError:this.storageError || null};
  }
  snapshot() {
    const g = this.game;
    return {...this.observation(),particles:g.particles.map(p=>({...p})),ships:g.ships.map(s=>({...s})),power:g.power,invincible:g.invincible,agent:this.agentInfo(),lastSummary:this.lastSummary};
  }
  async finish(reason) {
    const recording = this.recording; if (!recording) return; this.recording = null;
    const summary = {reason,mode:this.mode,provider:this.matchProvider,model:[...(this.matchModels || [])][0] || this.ollama.model,score:this.game.score,wave:this.game.wave,seconds:this.game.time,rewards:{...this.rewards},startedAt:this.startedAt,endedAt:new Date().toISOString()};
    const result = await recording.finish(summary); this.lastSummary = result;
    for (const model of this.matchModels || []) {
      this.reflection = this.reflection.catch(()=>{}).then(()=>this.ollama.reflect({...result,model})).catch(error => {this.storageError=error.message;});
    }
    return result;
  }
}
