import { parentPort, workerData } from 'node:worker_threads';
import { trainPolicy } from '../agents/train.mjs';
try { parentPort.postMessage({ type: 'result', result: trainPolicy(workerData, progress => parentPort.postMessage({ type: 'progress', ...progress })) }); }
catch (error) { parentPort.postMessage({ type: 'error', error: error.message }); }
