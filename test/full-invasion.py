"""Measure actual frame cadence with all enemies alive, not just JS render cost.
Run: python test/full-invasion.py . [--canvas | --webgl] [--soak]
Requires Python Playwright and installed Chromium; use CHROMIUM_PATH to override.
No server is needed: test resources are routed directly from the checkout.
"""
import json, os, sys
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
root = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1100}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def route(r):
        path = urlparse(r.request.url).path.lstrip('/')
        if path == 'bench.html':
            r.fulfill(body='<html><body style="margin:0;background:#080c15"><canvas id="game" style="width:1088px;height:771px"></canvas></body></html>', content_type='text/html')
        else:
            file = root / path
            if file.is_file():
                r.fulfill(body=file.read_bytes(), content_type='text/javascript' if file.suffix == '.js' else 'text/plain')
            else:
                r.fulfill(status=404)
    page.route('http://load.test/**', route)
    if '--canvas' in sys.argv:
        page.add_init_script("const getContext=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'||type==='webgl2'?null:getContext.call(this,type,...args);};")
    page.goto('http://load.test/bench.html')
    results = page.evaluate('''async (options) => {
      const {Game} = await import('./src/engine.js');
      const {Renderer} = await import('./src/renderer.js');
      const renderer = new Renderer(document.getElementById('game'), {backend: options.forceGPU ? 'webgl' : 'auto'});
      const results = [];
      for (const [count, heavy] of [[3, false], [36, false], [144, true]]) {
        const game = new Game(() => .5); game.coop = true; game.reset();
        game.enemies = Array.from({length: count}, (_, i) => ({x: 70 + i % 12 * 70, y: 120 + Math.floor(i / 12) * 25, w: 34, h: 28, row: i % 4, hp: 100000}));
        if (heavy) {
          game.shots = Array.from({length: 256}, (_, i) => ({x: 30 + i * 37 % 900, y: 100 + i * 29 % 450, friendly: i % 3 > 0, owner: i % 2 ? 'player' : 'wingman'}));
          game.particles = Array.from({length: 1000}, (_, i) => ({x: i * 71 % 960, y: i * 43 % 680, life: .7, color: '#a1ffda'}));
        }
        const intervals = [], costs = [];
        let start, previous;
        await new Promise(resolve => {
          function frame(timestamp) {
            if (start === undefined) start = timestamp;
            if (previous !== undefined) intervals.push(timestamp - previous);
            previous = timestamp;
            renderer.recordFrame?.(timestamp, true);
            const before = performance.now();
            renderer.render(game, timestamp / 1000);
            costs.push(performance.now() - before);
            if (timestamp - start >= (heavy ? options.duration : 2500)) resolve(); else requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        });
        const sorted = intervals.slice(5).sort((a,b)=>a-b), cpu = costs.slice(5).sort((a,b)=>a-b);
        results.push({enemies: count, shots: game.shots.length, particles: game.particles.length,
          fps: Math.round(1000 * intervals.length / intervals.reduce((a,b)=>a+b,0)),
          frameP95Ms: Math.round(sorted[Math.floor(sorted.length*.95)]*10)/10,
          renderP95Ms: Math.round(cpu[Math.floor(cpu.length*.95)]*10)/10,
          renderer: renderer.getStats?.() ?? {backend:'legacy-canvas2d'}});
        if (renderer.backend?.gl && renderer.backend.gl.getError() !== renderer.backend.gl.NO_ERROR) throw new Error('WebGL error');
      }
      return results;
    }''', {'forceGPU': '--webgl' in sys.argv, 'duration': 30000 if '--soak' in sys.argv else 2500})
    assert not errors, errors
    output = {'checkout': str(root), 'forcedCanvas': '--canvas' in sys.argv, 'forcedWebGL': '--webgl' in sys.argv, 'scenes': results, 'pageErrors': errors}
    print(json.dumps(output, indent=2))
    # Tiny and full invasions must retain real-time cadence relative to each other.
    assert results[1]['fps'] >= results[0]['fps'] * .8, 'Full invasion degrades frame cadence by more than 20%'
    browser.close()
