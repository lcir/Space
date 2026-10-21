import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { WebSocketServer, WebSocket } from 'ws';
import { Store, readJSON } from './store.mjs';
import { OllamaPilot } from './ollama.mjs';
import { Room, RequestError } from './room.mjs';
const root = fileURLToPath(new URL('../',import.meta.url));
function json(response,status,data) { response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}); response.end(JSON.stringify(data)); }
async function body(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new RequestError('Use application/json',415);
  let content = ''; for await (const chunk of request) { content += chunk; if (Buffer.byteLength(content) > 16384) throw new RequestError('Request too large',413); }
  try { const value = JSON.parse(content || '{}'); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new RequestError('Invalid JSON body'); }
}
function sameOrigin(request) {
  const host = request.headers.host || '';
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) && host !== process.env.ARENA_HOST) return false;
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  if (!request.headers.origin) return true;
  try { return new URL(request.headers.origin).host === host; } catch { return false; }
}
export async function createArena(options = {}) {
  const store = options.store || new Store(resolve(options.dataDir || process.env.DATA_DIR || join(root,'.data'))); await store.init();
  const ollama = new OllamaPilot({baseURL:options.ollamaURL || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434', model:options.model || process.env.OLLAMA_MODEL || 'qwen2.5:0.5b',store,timeoutMs:options.ollamaTimeout ?? Number(process.env.OLLAMA_TIMEOUT_MS || 12000)}); await ollama.init();
  const room = new Room({store,ollama,timeLimit:options.timeLimit}); let trainWorker = null;
  const server = createServer(async (request,response) => {
    try {
      if (!sameOrigin(request)) throw new RequestError('Origin/host is not allowed',403);
      const url = new URL(request.url,'http://localhost'), path = decodeURIComponent(url.pathname);
      if (path === '/health') return json(response,200,{ok:true,version:'3.0.0'});
      if (path.startsWith('/api/')) {
        if (request.method === 'GET') {
          if (path === '/api/state') return json(response,200,room.snapshot());
          if (path === '/api/matches') return json(response,200,{matches:await store.list()});
          if (path === '/api/agent') return json(response,200,room.agentInfo());
          if (path === '/api/models') {
            try { return json(response,200,{available:true,models:await ollama.models(),selected:ollama.model}); }
            catch { return json(response,200,{available:false,models:[],selected:ollama.model,error:'Ollama is not reachable; start it and install a model'}); }
          }
          const match = path.match(/^\/api\/matches\/([\w-]+)\/download$/);
          if (match) { const file=join(store.records,match[1]+'.jsonl'); await stat(file); response.writeHead(200,{'Content-Type':'application/x-ndjson','Content-Disposition':`attachment; filename="${match[1]}.jsonl"`}); createReadStream(file).on('error',()=>response.destroy()).pipe(response); return; }
          throw new RequestError('Unknown endpoint',404);
        }
        if (request.method !== 'POST') throw new RequestError('Method not allowed',405);
        const value = await body(request);
        if (path === '/api/start') return json(response,200,await room.start(value));
        if (path === '/api/control') { room.control(value.command); return json(response,200,{ok:true}); }
        if (path === '/api/claim') return json(response,200,room.claim(value.role || 'wingman',value.name || 'Codex','external',value.token));
        if (path === '/api/step') return json(response,200,await room.step(value));
        if (path === '/api/action') return json(response,200,room.action(value));
        if (path === '/api/release') { room.release(value.token); return json(response,200,{ok:true}); }
        if (path === '/api/config') {if(value.provider==='learned')room.trained=await readJSON(join(store.directory,'policy.json'),null);return json(response,200,room.configure(value));}
        if (path === '/api/train') {
          if (trainWorker) throw new RequestError('Training is already running',409);
          const generations=value.generations ?? 10,population=value.population ?? 8,seconds=value.seconds ?? 300;
          if (![generations,population,seconds].every(Number.isInteger) || generations<1 || generations>200 || population<2 || population>16 || seconds<5 || seconds>300) throw new RequestError('Training limits: 1..200 generations, 2..16 candidates, 5..300 seconds per episode');
          room.learning={status:'training',generation:0,generations};
          let resultReceived=false;
          trainWorker=new Worker(new URL('./train-worker.mjs',import.meta.url),{workerData:{directory:store.directory,generations,population,seconds,benchmark:options.trainingBenchmark}});
          const activeWorker=trainWorker;
          trainWorker.on('message',async message => {
            if (message.type==='progress') room.learning={status:'training',...message};
            if (message.type==='result') {
              resultReceived=true;
              try { room.trained=await readJSON(join(store.directory,'policy.json'),room.trained); room.learning={status:'ready',result:message.result}; }
              catch { room.learning={status:'error',error:'Unable to load trained policy'}; }
              finally {if(trainWorker===activeWorker)trainWorker=null;}
            }
            if (message.type==='error') room.learning={status:'error',error:message.error};
          });
          trainWorker.on('error',()=>{room.learning={status:'error',error:'Training worker failed'};});
          trainWorker.on('exit',code=>{if(!resultReceived)trainWorker=null;if(!resultReceived && room.learning.status==='training') room.learning={status:'error',error:'Training was interrupted'};});
          return json(response,202,room.learning);
        }
        throw new RequestError('Unknown endpoint',404);
      }
      if (request.method !== 'GET') throw new RequestError('Method not allowed',405);
      if (path === '/favicon.ico') { response.writeHead(204).end(); return; }
      const source = ['/', '/arena','/index.html'].includes(path) ? 'index.html' : path.slice(1);
      if (source !== 'index.html' && !/^(src|playable)\/[a-zA-Z0-9_./-]+\.(js|css|html)$/.test(source)) throw new RequestError('Not found',404);
      const file=resolve(root,source); if (!file.startsWith(root) || source.split('/').includes('..')) throw new RequestError('Not found',404);
      const content=await readFile(file); response.writeHead(200,{'Content-Type':{'.js':'text/javascript','.css':'text/css','.html':'text/html'}[extname(file)],'Cache-Control':'no-cache'}); response.end(content);
    } catch (error) { if (!response.headersSent) json(response,error.status || (error.code==='ENOENT'?404:500),{error:error.status ? error.message : error.code==='ENOENT'?'Not found':'Server error'}); else response.destroy(); }
  });
  const sockets=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
  server.on('upgrade',(request,socket,head)=>{
    let path;try{path=new URL(request.url,'http://localhost').pathname;}catch{socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');return;}
    if (path !== '/ws' || !sameOrigin(request)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return; }
    sockets.handleUpgrade(request,socket,head,ws=>sockets.emit('connection',ws));
  });
  sockets.on('connection',socket=>{
    const owner='browser:'+randomUUID(); const send=value=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(value));};
    socket.on('message',(data,binary)=>{
      try {
        if(binary)throw new RequestError('Use JSON text'); const value=JSON.parse(data.toString());
        if(value.type==='join'){if(room.mode==='ai')send({type:'spectator'});else send({type:'joined',...room.claim('player','Human',owner)});}
        else if(value.type==='input' && room.mode==='ai')return;
        else if(value.type==='input')room.action({...value,role:'player'},owner);
        else throw new RequestError('Unknown socket message');
      }catch(error){send({type:'error',error:error.status?error.message:'Invalid message'});}
    });
    socket.on('close',()=>room.releaseOwner(owner)); socket.on('error',()=>room.releaseOwner(owner));
    send({type:'state',observation:room.snapshot(),events:[]});
  });
  const ticker=setInterval(()=>room.tick(),8); ticker.unref();
  const broadcast=setInterval(()=>{
    if(!sockets.clients.size){room.pendingEvents.length=0;return;}
    const payload=JSON.stringify({type:'state',observation:room.snapshot(),events:room.pendingEvents.splice(0)});
    for(const socket of sockets.clients)if(socket.readyState===WebSocket.OPEN && socket.bufferedAmount<1024*1024)socket.send(payload);
  },50); broadcast.unref();
  return {server,room,store,ollama,
    async listen(port=Number(process.env.PORT || 3000),host=process.env.BIND_HOST || '127.0.0.1') { await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});return server.address(); },
    async close() {clearInterval(ticker);clearInterval(broadcast);ollama.stop();if(trainWorker)await trainWorker.terminate();for(const socket of sockets.clients)socket.terminate();sockets.close();await room.finish('server-stopped');await room.reflection;const closed=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await closed;}
  };
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=await createArena();const address=await app.listen();console.log(`Agent arena: http://localhost:${address.port}/arena`);
  let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(stopping)return;stopping=true;await app.close();process.exit(0);});
}
