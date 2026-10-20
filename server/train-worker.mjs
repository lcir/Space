import { parentPort, workerData } from 'node:worker_threads';
import { runTraining } from '../agents/training-store.mjs';
const { directory, ...options } = workerData;
runTraining(directory, options, progress => parentPort.postMessage({ type: 'progress', ...progress }))
  .then(result => parentPort.postMessage({ type: 'result', result }))
  .catch(error => parentPort.postMessage({ type: 'error', error: error.message }));
