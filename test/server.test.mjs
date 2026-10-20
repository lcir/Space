import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createArena } from '../server/app.mjs';
import { ArenaClient } from '../agents/control.mjs';
import { createTraining, trainGeneration, benchmarkPolicy } from '../agents/train.mjs';
import { runTraining, loadTraining } from '../agents/training-store.mjs';
import { Game } from '../src/engine.js';
import { DEFAULT_POLICY, seededRandom, shotThreats, firstCollision, ruleTarget, policyTarget, policyInput, safeX } from '../agents/policy.mjs';
import { DEFAULT_STRATEGY, chatMessages, gameObservation, validCommand } from '../agents/llm.mjs';
import { teacherRollouts } from '../agents/distill.mjs';
import { playGame, controller } from '../agents/llm-bench.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(t,options={}) {
  const directory=await mkdtemp(join(tmpdir(),'arena-'));
  const app=await createArena({dataDir:directory,...options});const address=await app.listen(0);
  const base=`http://127.0.0.1:${address.port}`,client=new ArenaClient(base);
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  return {app,base,client,directory};
}
test('external agent moves only its leased wingman, with bounded expiry and real recording',async t=>{
  const {app,client}=await fixture(t);await client.start();await client.claim('wingman','Integration agent');
  const before=await client.observe();await client.act({right:true,fire:true},100);await sleep(180);const after=await client.observe();
  assert.ok(after.wingman.x>before.wingman.x);assert.equal(after.player.x,before.player.x);
  assert.ok(after.time>before.time);assert.equal(after.agent.external.commandFresh,false);assert.ok(after.shots.some(s=>s.owner==='wingman'));
  const invalid=await fetch(new URL('/api/action',client.baseURL),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:client.lease.token,role:'player',action:{left:true}})});
  assert.equal(invalid.status,403);
  await assert.rejects(client.act({right:true},99999),/durationMs/);
  await assert.rejects(client.request('/api/claim',{role:'wingman',name:'Other agent'}),/already/);
  await client.request('/api/config',{provider:'none'});assert.equal(app.room.leases.has('wingman'),false);
  await client.request('/api/control',{command:'pause'});const time=app.room.game.time;await sleep(50);assert.equal(app.room.game.time,time);
  await app.room.finish('test-end');const records=await client.request('/api/matches');assert.equal(records.matches.length,1);
  const recording=await fetch(new URL(`/api/matches/${records.matches[0].id}/download`,client.baseURL)).then(r=>r.text());
  assert.match(recording,/Integration agent/);assert.match(recording,/"type":"end"/);assert.ok(!recording.includes(client.lease.token));
});
test('WebSocket human and HTTP agent independently fly two ships',async t=>{
  const {app,base,client}=await fixture(t);await client.start();await client.claim();
  const socket=new WebSocket(base.replace('http:','ws:')+'/ws');t.after(()=>socket.terminate());
  const messages=[];socket.on('message',data=>messages.push(JSON.parse(data)));await once(socket,'open');socket.send(JSON.stringify({type:'join'}));
  for(let i=0;i<50&&!messages.some(m=>m.type==='joined');i++)await sleep(5);
  const joined=messages.find(m=>m.type==='joined');assert.ok(joined);
  socket.send(JSON.stringify({type:'input',token:joined.token,action:{left:true,fire:true},durationMs:100}));await client.act({right:true,fire:true},100);await sleep(120);
  assert.ok(app.room.game.player.x<340);assert.ok(app.room.game.wingman.x>620);
  assert.ok(messages.some(m=>m.type==='state'&&m.observation.ships.length===2));
  socket.close();await once(socket,'close');
  for(let i=0;i<100&&app.room.leases.has('player');i++)await sleep(5);
  assert.equal(app.room.leases.has('player'),false);
});
test('foreign origins and private files are rejected; snapshots expose no controller token',async t=>{
  const {base,client}=await fixture(t);await client.claim();
  assert.equal((await fetch(base+'/api/start',{method:'POST',headers:{origin:'https://evil.example','Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/.data/policy.json')).status,404);
  assert.equal((await fetch(base+'/server/app.mjs')).status,404);
  assert.ok(!JSON.stringify(await client.observe()).includes(client.lease.token));
  assert.equal((await fetch(base+'/health')).status,200);
});
test('real Ollama HTTP protocol produces actions and persists reflection memory',async t=>{
  const calls=[];
  const fake=createServer(async(req,res)=>{
    if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'test-model'}]}));return;}
    let body='';for await(const chunk of req)body+=chunk;const value=JSON.parse(body);calls.push(value);
    const reflection=value.format.properties.strategy;
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:{content:JSON.stringify(reflection?{strategy:'Stay behind lower invaders and move away from projected bullet impact.'}:{targetX:800,fire:true,dodge:true})}}));
  });await new Promise(r=>fake.listen(0,'127.0.0.1',r));t.after(()=>{fake.closeAllConnections();fake.close();});
  const {app,client}=await fixture(t,{ollamaURL:`http://127.0.0.1:${fake.address().port}`,model:'test-model'});
  await client.request('/api/config',{provider:'ollama'});await client.start();await sleep(180);
  assert.ok(calls.length);assert.ok(app.room.game.wingman.x>620);assert.equal(app.ollama.status,'active');
  app.room.control('pause');const summary=await app.room.finish('test-end');await app.room.reflection;
  const memory=await app.store.memory('test-model');assert.equal(memory.matches,1);assert.equal(memory.lastMatchId,summary.id);assert.match(memory.strategy,/projected/);assert.equal(summary.model,'test-model');
});
test('slow Ollama cannot block game ticks and cleanly enters fallback',async t=>{
  const fake=createServer(async(req,res)=>{for await(const chunk of req){};setTimeout(()=>res.end('{}'),500);});await new Promise(r=>fake.listen(0,'127.0.0.1',r));t.after(()=>{fake.closeAllConnections();fake.close();});
  const {app,client}=await fixture(t,{ollamaURL:`http://127.0.0.1:${fake.address().port}`,ollamaTimeout:50});
  await client.request('/api/config',{provider:'ollama'});await client.start();await sleep(160);
  assert.ok(app.room.game.time>.1);assert.equal(app.ollama.status,'fallback');assert.match(app.ollama.lastError,/timed out/);
  // Avoid an intentionally slow model reflection in fixture shutdown.
  assert.equal(app.room.matchModels.size,0);
});
const quick={benchmark:{seeds:[1,2],seconds:10}},step={population:3,seeds:1,seconds:8};
test('training resumes from a JSON checkpoint exactly as an uninterrupted run',()=>{
  const start=createTraining(undefined,quick),straight=trainGeneration(trainGeneration(start,step).state,{...step,benchmark:true}).state;
  const resumed=trainGeneration(JSON.parse(JSON.stringify(trainGeneration(start,step).state)),{...step,benchmark:true}).state;
  assert.deepEqual({...resumed,updatedAt:0,champion:{...resumed.champion,promotedAt:0}},{...straight,updatedAt:0,champion:{...straight.champion,promotedAt:0}});
  assert.equal(straight.generation,2);assert.ok(straight.champion.benchmark>=start.champion.benchmark);
});
test('persistent training continues across runs, warm-starts from a saved policy and only promotes better champions',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'training-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  await writeFile(join(directory,'policy.json'),JSON.stringify({kind:'evolved-controller-v1',params:{lead:.4,dodgeWindow:190,dodgeMargin:80,targetBias:20,fireMargin:850}}));
  assert.equal((await loadTraining(directory,quick)).champion.params.lead,.4);
  const first=await runTraining(directory,{generations:3,benchmarkEvery:1,...quick,...step});
  const state=JSON.parse(await readFile(join(directory,'training','state.json'),'utf8'));
  assert.equal(state.generation,3);
  const second=await runTraining(directory,{generations:2,...quick,...step});
  assert.equal(second.generation,5);assert.equal(second.generations,2);assert.ok(second.championLevel>=first.championLevel);
  const history=(await readFile(join(directory,'training','history.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(history.map(entry=>entry.generation),[1,2,3,4,5]);
  const champions=history.filter(entry=>entry.benchmark!==null).map(entry=>entry.champion);
  assert.deepEqual(champions,[...champions].sort((a,b)=>a-b));
  if(second.promotions+first.promotions){const policy=JSON.parse(await readFile(join(directory,'policy.json'),'utf8'));assert.equal(policy.kind,'evolved-controller-v2');assert.equal(policy.benchmarkLevel,second.championLevel);}
});
test('training runs in a worker while HTTP observation and simulation remain available',async t=>{
  const {app,client,directory}=await fixture(t,{trainingBenchmark:{seeds:[1,2],seconds:10}});await client.start();
  await client.request('/api/train',{generations:1,population:2,seconds:5});
  for(let i=0;i<1000&&app.room.learning.status==='training';i++){await client.observe();await sleep(10);}
  assert.equal(app.room.learning.status,'ready');assert.ok(app.room.game.time>0);assert.equal(app.room.learning.result.generation,1);
  const state=JSON.parse(await readFile(join(directory,'training','state.json'),'utf8'));assert.equal(state.generation,1);
});
test('Codex can step a paused solo episode without wall-clock timing or affecting co-op',async t=>{
 const {client}=await fixture(t);await client.start('ai');await client.claim('player','Codex step test');
 await client.request('/api/control',{command:'pause'});const before=await client.observe();
 const after=await client.step({targetX:700,fire:true,dodge:true},120);
 assert.equal(after.state,'paused');assert.ok(Math.abs(after.time-before.time-1)<1e-8);assert.ok(after.player.x>before.player.x);
 await client.start('coop');await client.request('/api/control',{command:'pause'});
 await assert.rejects(client.step({targetX:500,fire:true}),/paused solo/);
});

test('public HTML and modules serve complete content, not merely a 200 status',async t=>{
 const {base}=await fixture(t);
 const html=await fetch(base+'/arena');assert.equal(html.status,200);assert.match(await html.text(),/id="agent-panel"/);
 const script=await fetch(base+'/src/main.js');assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);assert.match(await script.text(),/OnlineSession/);
});
test('switching to solo AI releases human ownership and leaves browsers as spectators',async t=>{
 const {base,client,app}=await fixture(t);await client.start();
 const socket=new WebSocket(base.replace('http:','ws:')+'/ws');t.after(()=>socket.terminate());
 const messages=[];socket.on('message',data=>messages.push(JSON.parse(data)));await once(socket,'open');socket.send(JSON.stringify({type:'join'}));
 for(let i=0;i<40&&!messages.some(m=>m.type==='joined');i++)await sleep(5);
 assert.ok(app.room.leases.get('player'));await client.start('ai');await client.claim('player','Codex solo');
 socket.send(JSON.stringify({type:'join'}));await sleep(30);assert.ok(messages.some(m=>m.type==='spectator'));
 assert.equal(app.room.leases.get('player').name,'Codex solo');
});
test('distillation examples show the model exactly the live prompt and a valid teacher action',()=>{
  const [example]=teacherRollouts(DEFAULT_POLICY,1,42),game=new Game(seededRandom(42));game.reset();
  for(let tick=0;tick<60;tick++)game.update(1/120,{});
  assert.equal(example.messages[0].content,chatMessages(gameObservation(game),DEFAULT_STRATEGY)[0].content);
  const user=JSON.parse(example.messages[1].content),action=validCommand(JSON.parse(example.messages[2].content));
  assert.equal(user.ship,'player');assert.equal(user.direction,1);assert.ok(user.enemies.length>0);assert.ok(action.targetX>=32&&action.targetX<=928);
});
test('LLM benchmark waits for every decision and replays the same game for the same seed',async()=>{
  const reached=[],options={seconds:5,interval:.25,onDecision:game=>reached.push(game.time)};
  const first=await playGame(5,controller('oracle'),options),second=await playGame(5,controller('oracle'),{seconds:5,interval:.25});
  assert.equal(first.decisions,20);assert.equal(reached.length,20);assert.deepEqual({...first,latencyMs:0},{...second,latencyMs:0});
});
test('safe dodging plays the same games as when the collision prediction was shared',()=>{
  // Recorded after the deadband shrank to half a step; any other change to dodging shows up here.
  assert.deepEqual(benchmarkPolicy(DEFAULT_POLICY,{seeds:[1,2,3],seconds:60}),{level:7.4259259259259265,seconds:59.999999999997236,score:15325});
  const g=new Game(()=>.5);g.reset();const s=g.player;s.invincible=0;g.shots=[{x:s.x,y:s.y-200,vx:0,vy:300,w:8,h:18,friendly:false}];
  const threats=shotThreats(g,s,2,4);assert.ok(Number.isFinite(firstCollision(s,threats,s.x)));assert.equal(firstCollision(s,threats,s.x,1),Infinity);
});
test('drop priority rules take a safe + first, then a missing triple laser, then enemies',()=>{
  const R={...DEFAULT_POLICY,rules:true},drop=(x,type,y=300)=>({id:'d'+x+type,x,y,w:24,h:24,type});
  const setup=({lives=3,power=0,drops=[],shots=[],invincible=0,coop=false}={})=>{const g=new Game(()=>.5);g.coop=coop;g.reset();for(const s of g.ships){s.lives=lives;s.power=power;s.invincible=invincible;}g.drops=drops;g.shots=shots;return g;};
  const x=480,unsafe={x:x+200,y:594-260,vx:0,vy:300,w:8,h:18,friendly:false};
  let g=setup({lives:2,drops:[drop(x+200,'shield'),drop(x-100,'rapid')]});assert.deepEqual(ruleTarget(g,g.player,R),{targetX:x+200,fire:true,reason:'life'});
  g=setup({lives:2,drops:[drop(x+200,'shield'),drop(x-100,'rapid')],shots:[unsafe]});assert.deepEqual(ruleTarget(g,g.player,R),{targetX:x-100,fire:true,reason:'triple'});
  g=setup({lives:2,drops:[drop(x+200,'shield')],shots:[unsafe],invincible:5});assert.equal(ruleTarget(g,g.player,R).reason,'life');
  g=setup({lives:2,drops:[drop(x+200,'shield')],shots:[unsafe],invincible:.5});assert.equal(ruleTarget(g,g.player,R).reason,'enemy');
  g=setup({drops:[drop(x+200,'shield')],shots:[{...unsafe,y:594-24-600}]});assert.equal(ruleTarget(g,g.player,R).reason,'enemy');
  g=setup({drops:[drop(x+300,'rapid')]});assert.equal(ruleTarget(g,g.player,{...R,fireMargin:35}).fire,false);
  g=setup({drops:[drop(x+200,'shield')]});assert.equal(ruleTarget(g,g.player,R).reason,'life');
  g=setup();const enemy=ruleTarget(g,g.player,R);assert.equal(enemy.reason,'enemy');assert.equal(enemy.targetX,policyTarget(setup(),setup().player,{...DEFAULT_POLICY,rapidValue:0,shieldValue:0}).targetX);
  g=setup({power:3,drops:[drop(x+100,'rapid')]});assert.equal(ruleTarget(g,g.player,R).reason,'enemy');
  g=setup({drops:[drop(x+300,'rapid'),drop(x-60,'rapid')]});assert.equal(ruleTarget(g,g.player,R).targetX,x-60);
  g=setup({drops:[drop(x+100,'rapid',594+10),drop(x+450,'rapid',594-60)]});assert.equal(ruleTarget(g,g.player,R).reason,'enemy');
  g=setup({drops:[drop(x+100,'rapid')]});g.enemies=[];assert.equal(ruleTarget(g,g.player,R).reason,'triple');
  g=setup();g.enemies=[];assert.equal(ruleTarget(g,g.player,R).targetX,480);
  g=setup({coop:true,drops:[drop(720,'rapid')]});g.player.power=3;assert.equal(ruleTarget(g,g.wingman,R).reason,'triple');assert.equal(ruleTarget(g,g.player,R).reason,'enemy');
  assert.equal(policyTarget(g,g.wingman,R).targetX,720);
});
test('the ship moves to a nearby safe position instead of waiting inside its deadband',()=>{
  const g=new Game(()=>.5);g.reset();const s=g.player;s.invincible=0;s.x=471.3;g.shots=[{x:492,y:438,vx:0,vy:400,w:8,h:18,friendly:false}];
  assert.equal(safeX(g,s,480),464);assert.equal(policyInput(g,s,DEFAULT_POLICY,{targetX:480}).left,true);
});
