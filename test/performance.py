"""Sample render CPU time in Chromium. Requires Python Playwright and Chromium.
Run from the repository root: python test/performance.py .
Use the same viewport, machine and idle conditions when comparing revisions.
"""
import json,sys,os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
root=Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1100},device_scale_factor=2)
 def route(r):
  f=root/(urlparse(r.request.url).path.lstrip('/') or 'index.html')
  r.fulfill(body=f.read_bytes(),content_type={'.js':'text/javascript','.css':'text/css','.html':'text/html'}.get(f.suffix,'text/plain')) if f.is_file() else r.fulfill(status=404)
 page.route('http://bench.test/**',route)
 page.goto('http://bench.test/')
 page.wait_for_function('window.spaceInvaders')
 page.evaluate('''async()=>{const {Renderer}=await import('./src/renderer.js');const original=Renderer.prototype.render;window.measurements=[];Renderer.prototype.render=function(...args){const start=performance.now();const result=original.apply(this,args);measurements.push(performance.now()-start);return result;};spaceInvaders.start();}''')
 page.wait_for_timeout(4500)
 print(json.dumps(page.evaluate('''()=>{const a=measurements.slice(5).sort((a,b)=>a-b);return {frames:a.length,renderMedianMs:a[Math.floor(a.length*.5)],renderP95Ms:a[Math.floor(a.length*.95)]};}''')))
 b.close()
