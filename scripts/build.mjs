import { mkdir, cp, rm, readFile, writeFile } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const path of ['index.html', 'src']) await cp(path, `dist/${path}`, { recursive: true });
// A portable edition can also be opened directly without a server or tooling.
const modules = await Promise.all(['collision-grid', 'engine', 'loop', 'quality', 'canvas-renderer', 'webgl-renderer', 'renderer', 'pilot', 'online', 'main'].map(name => readFile(`src/${name}.js`, 'utf8')));
const js = modules.map(code => code.replace(/^import .*;\n/gm, '').replace(/^export /gm, '')).join('\n');
const css = await readFile('src/style.css', 'utf8');
const html = (await readFile('index.html', 'utf8'))
  .replace('<link rel="stylesheet" href="./src/style.css">', `<style>${css}</style>`)
  .replace('<script type="module" src="./src/main.js"></script>', `<script type="module">${js}</script>`);
await writeFile('dist/space-invaders.html', html);
console.log('Static game built in dist/');
