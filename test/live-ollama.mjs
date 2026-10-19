// Optional live validation. Start arena + Ollama and install the model first.
import {ArenaClient} from '../agents/control.mjs';
const client=new ArenaClient(process.env.ARENA_URL || 'http://127.0.0.1:3000');
const model=process.env.OLLAMA_MODEL || 'qwen2.5:0.5b';
const baseline=(await client.request('/api/agent')).ollama.memory?.matches || 0;
await client.request('/api/config',{provider:'ollama',model});await client.start('ai');
let fresh=false,last;
for(let i=0;i<60;i++){
 await new Promise(r=>setTimeout(r,350));last=await client.observe();
 if(last.agent.controlSource==='ollama'){fresh=true;await new Promise(r=>setTimeout(r,1000));break;}
}
await client.request('/api/config',{provider:'none'});await client.start('human');await client.request('/api/control',{command:'pause'});
const matches=await client.request('/api/matches');
const match=matches.matches.find(m=>m.provider==='ollama'&&m.model===model);
let memory;
for(let i=0;i<70;i++){
 memory=(await client.request('/api/agent')).ollama.memory;
 if(memory?.lastMatchId===match?.id)break;
 await new Promise(r=>setTimeout(r,350));
}
const text=match?await fetch(new URL(`/api/matches/${match.id}/download`,client.baseURL)).then(r=>r.text()):'';
const actions=text.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(line=>line.type==='action'&&line.source==='ollama');
console.log(JSON.stringify({model,liveActions:actions.length,freshModelControl:fresh,score:last?.score,memoryMatches:memory?.matches,strategy:memory?.strategy,reflectionError:memory?.reflectionError || null}));
if(!fresh||!actions.length||!memory||memory.matches<=baseline||memory.lastMatchId!==match?.id||memory.reflectionError)process.exitCode=1;
