import { mkdir, readFile, writeFile, rename, readdir, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { once } from 'node:events';
export async function readJSON(path, fallback) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; } }
export async function atomicJSON(path, value) {
  const temp = path + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n'); await rename(temp, path);
}
export class Store {
  constructor(directory) { this.directory = directory; this.records = join(directory, 'matches'); }
  async init() { await mkdir(this.records, { recursive: true }); await mkdir(join(this.directory, 'memory'), { recursive: true }); }
  memoryPath(model) { return join(this.directory, 'memory', createHash('sha256').update(model).digest('hex').slice(0, 24) + '.json'); }
  async memory(model) { return readJSON(this.memoryPath(model), { model, matches: 0, strategy: 'Aim at the bottom-most invaders. Keep clear of incoming shots.', recent: [] }); }
  async list() {
    const names = (await readdir(this.records)).filter(name => name.endsWith('.summary.json')).sort().reverse();
    return Promise.all(names.slice(0, 100).map(name => readJSON(join(this.records, name), null))).then(a => a.filter(Boolean));
  }
  async prune() {
    const names = (await readdir(this.records)).filter(name => name.endsWith('.summary.json')).sort().reverse();
    for (const name of names.slice(100)) { const id = name.replace('.summary.json', ''); await rm(join(this.records, name), { force: true }); await rm(join(this.records, id + '.jsonl'), { force: true }); }
  }
  begin(meta) { return new Recording(this, meta); }
}
class Recording {
  constructor(store, meta) {
    this.store = store; this.id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
    this.bytes = 0; this.truncated = false; this.error = null;
    this.stream = createWriteStream(join(store.records, this.id + '.jsonl'), { flags: 'wx' });
    this.stream.on('error', () => { this.error = 'Recording storage failed'; });
    this.write('start', meta);
  }
  write(type, data) {
    if (this.error || this.stream.destroyed || this.stream.writableEnded) return;
    const line = JSON.stringify({ type, ...data }) + '\n';
    if (type !== 'end' && (this.bytes + Buffer.byteLength(line) > 12 * 1024 * 1024 || this.stream.writableLength > 1024 * 1024)) { this.truncated = true; return; }
    this.bytes += Buffer.byteLength(line); this.stream.write(line);
  }
  async finish(summary) {
    summary = { id: this.id, ...summary, truncated: this.truncated, recordingError: this.error };
    this.write('end', summary);
    if (!this.stream.destroyed) { const finished = once(this.stream, 'finish').catch(() => {}); this.stream.end(); await finished; }
    await atomicJSON(join(this.store.records, this.id + '.summary.json'), summary); await this.store.prune(); return summary;
  }
}
