import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createArena } from '../server/app.mjs';
import { ArenaClient } from '../agents/control.mjs';
import { trainPolicy } from '../agents/train.mjs';
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
  socket.close();await once(socket,'close');assert.equal(app.room.leases.has('player'),false);
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
test('reward optimization retains an elite and reports held-out performance',()=>{
  const result=trainPolicy({generations:2,population:3,seeds:[7],seconds:8});
  assert.ok(result.trainingReward>=result.baseline);assert.equal(result.kind,'evolved-controller-v1');assert.ok(Number.isFinite(result.validationReward));assert.ok(result.episodes>5);
});
test('training runs in a worker while HTTP observation and simulation remain available',async t=>{
  const {app,client,directory}=await fixture(t);await client.start();
  await client.request('/api/train',{generations:1,population:2,seconds:5});
  for(let i=0;i<200&&app.room.learning.status==='training';i++){await client.observe();await sleep(10);}
  assert.equal(app.room.learning.status,'ready');assert.ok(app.room.game.time>0);
  const policy=JSON.parse(await readFile(join(directory,'policy.json'),'utf8'));assert.equal(policy.kind,'evolved-controller-v1');
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
