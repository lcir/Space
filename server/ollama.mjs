import { performance } from 'node:perf_hooks';
import { ACTION_FORMAT, chatMessages, validCommand } from '../agents/llm.mjs';
export class OllamaPilot {
  constructor({ baseURL, model, store, timeoutMs = 12000, reflectionTimeoutMs = 20000 }) {
    this.baseURL = new URL(baseURL); if (!['http:', 'https:'].includes(this.baseURL.protocol) || this.baseURL.username || this.baseURL.password) throw new Error('Invalid Ollama base URL');
    this.model = model; this.store = store; this.timeoutMs = timeoutMs; this.reflectionTimeoutMs = reflectionTimeoutMs;
    this.status = 'idle'; this.lastError = null; this.busy = false; this.nextAt = 0; this.generation = 0;
  }
  async init() { const model=this.model;const memory=await this.store.memory(model);if(model===this.model)this.memory=memory; }
  async models() {
    const response = await fetch(new URL('/api/tags', this.baseURL), { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const data = await response.json(); return (data.models || []).map(m => m.name).slice(0, 100);
  }
  async chat(messages, format, timeoutMs, model = this.model) {
    const response = await fetch(new URL('/api/chat', this.baseURL), { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model, stream: false, format, messages, options: { temperature: .2, num_predict: format.properties.strategy ? 384 : 80, num_ctx: 2048 } }) });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}; check that the selected model is installed`);
    const text = await response.text(); if (text.length > 100000) throw new Error('Ollama response is too large');
    const content = JSON.parse(text).message?.content; return JSON.parse(content);
  }
  stop() { this.generation++; this.status = 'idle'; }
  maybeDecide(observation, apply) {
    const now = performance.now(); if (this.busy || now < this.nextAt) return;
    this.busy = true; this.status = 'thinking'; const generation = this.generation;
    this.chat(chatMessages(observation, this.memory?.strategy), ACTION_FORMAT, this.timeoutMs)
      .then(command => {
        if (generation !== this.generation) return;
        apply(validCommand(command)); this.status = 'active'; this.lastError = null;
      }).catch(error => { if (generation === this.generation) { this.status = 'fallback'; this.lastError = error.name === 'TimeoutError' ? 'Ollama timed out; local reflex pilot is active' : error.message; } })
      .finally(() => { this.busy = false; this.latencyMs = Math.round(performance.now() - now); this.nextAt = performance.now() + (this.lastError ? 1500 : 200); });
  }
  async reflect(summary) {
    const model = summary.model || this.model;
    const memory = await this.store.memory(model);
    let strategy = memory.strategy, reflectionError = null;
    try {
      const result = await this.chat([{role:'system',content:'Improve a Space Invaders strategy using the match result and previous memory. Be specific about aiming and avoiding incoming shots. Return JSON with one short strategy sentence of at most 50 words. This is strategy memory, not model weight training.'},
        {role:'user',content:JSON.stringify({previous:memory.strategy, result:summary, recent:memory.recent})}], {type:'object',properties:{strategy:{type:'string',maxLength:600}},required:['strategy'],additionalProperties:false}, this.reflectionTimeoutMs, model);
      if (typeof result.strategy !== 'string' || !result.strategy.trim()) throw new Error('Invalid strategy reflection');
      strategy = result.strategy.slice(0,1600);
    } catch (error) { reflectionError = error.name === 'TimeoutError' ? 'Reflection timed out' : error.message; }
    const updated = { model, lastMatchId:summary.id, matches:memory.matches + 1, strategy, reflectionError, recent:[...(memory.recent || []), {id:summary.id,score:summary.score,reward:summary.rewards,seconds:summary.seconds}].slice(-8), updatedAt:new Date().toISOString() };
    const { atomicJSON } = await import('./store.mjs'); await atomicJSON(this.store.memoryPath(model), updated); if (this.model === model) this.memory = updated; return updated;
  }
  info() { return {model:this.model,status:this.status,lastError:this.lastError,latencyMs:this.latencyMs || null,memory:this.memory || null}; }
}
