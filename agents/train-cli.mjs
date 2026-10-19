import { trainPolicy } from './train.mjs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { atomicJSON } from '../server/store.mjs';
const directory=resolve(process.env.DATA_DIR || '.data');await mkdir(directory,{recursive:true});
const result=trainPolicy({},p=>console.log(`Generation ${p.generation}/${p.generations}: reward ${p.reward.toFixed(2)} (baseline ${p.baseline.toFixed(2)})`));
await atomicJSON(resolve(directory,'policy.json'),result);
console.log(JSON.stringify({saved:resolve(directory,'policy.json'),...result},null,2));
