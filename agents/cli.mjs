import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ArenaClient } from './control.mjs';
const {values,positionals}=parseArgs({allowPositionals:true,options:{url:{type:'string',default:'http://127.0.0.1:3000'},role:{type:'string',default:'wingman'},name:{type:'string',default:'Codex'},lease:{type:'string',default:'.data/agent-lease.json'},action:{type:'string'},frames:{type:'string',default:'60'},duration:{type:'string',default:'300'},mode:{type:'string',default:'coop'}}});
const client=new ArenaClient(values.url),file=resolve(values.lease),command=positionals[0] || 'observe';
try{client.lease=JSON.parse(await readFile(file,'utf8'));}catch{}
try {
 let result;
 if(command==='observe')result=await client.observe();
 else if(command==='start')result=await client.start(values.mode);
 else if(command==='pause'||command==='resume')result=await client.request('/api/control',{command});
 else if(command==='claim'){result=await client.claim(values.role,values.name);await mkdir(dirname(file),{recursive:true});await writeFile(file,JSON.stringify(client.lease),{mode:0o600});}
 else if(command==='act')result=await client.act(JSON.parse(values.action || '{}'),Number(values.duration));
 else if(command==='step')result=await client.step(JSON.parse(values.action || '{}'),Number(values.frames));
 else if(command==='release'){await client.release();await rm(file,{force:true});result={released:true};}
 else throw new Error('Commands: observe, start, pause, resume, claim, act, step, release');
 if(result?.enemies)result={state:result.state,time:result.time,score:result.score,wave:result.wave,player:result.player,wingman:result.wingman,enemies:result.enemies.map(({x,y,row,hp,boss})=>({x,y,row,hp,boss})),shots:result.shots,rewards:result.rewards,agent:result.agent};
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
