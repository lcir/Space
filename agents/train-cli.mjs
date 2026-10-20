import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { runTraining, trainingPaths } from './training-store.mjs';
const {values}=parseArgs({options:{generations:{type:'string'},minutes:{type:'string'},forever:{type:'boolean'},population:{type:'string',default:'8'},seeds:{type:'string',default:'4'},seconds:{type:'string',default:'120'},'benchmark-every':{type:'string',default:'5'}}});
const count=(name,lo,hi)=>{const n=Number(values[name]);if(!Number.isInteger(n)||n<lo||n>hi)throw new Error(`--${name} must be an integer between ${lo} and ${hi}`);return n;};
try {
  const directory=resolve(process.env.DATA_DIR || '.data'),limited=values.generations!==undefined||values.minutes!==undefined||values.forever;
  const options={generations:values.generations?count('generations',1,1e6):limited?Infinity:20,minutes:values.minutes?count('minutes',1,1e5):Infinity,
    population:count('population',2,32),seeds:count('seeds',1,16),seconds:count('seconds',5,300),benchmarkEvery:count('benchmark-every',1,1000)};
  let stopping=false;process.on('SIGINT',()=>{if(stopping)process.exit(130);stopping=true;console.log('\nStopping after this generation; press Ctrl+C again to quit now.');});
  const result=await runTraining(directory,{...options,shouldStop:()=>stopping},p=>console.log(p.type==='benchmark'
    ?`Final benchmark level ${p.benchmark.toFixed(2)} · champion level ${p.champion.toFixed(2)}${p.promoted?' · NEW CHAMPION':''}`
    :`Generation ${p.generation}: training ${p.trainingReward.toFixed(1)} · step ${p.step.toFixed(2)}${p.benchmark===null?'':` · benchmark level ${p.benchmark.toFixed(2)}`} · champion level ${p.champion.toFixed(2)}${p.promoted?' · NEW CHAMPION':''}`));
  console.log(JSON.stringify({...result,saved:trainingPaths(directory)},null,2));
} catch (error) { console.error(error.message); process.exitCode=1; }
