"""Optional UI regression: pip install playwright; use installed Chromium.

Routes serve repository files in-process, so no development server is needed.
Run from repository root: python test/browser-smoke.py
"""
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path.cwd()
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1100})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def route(request):
        path = urlparse(request.request.url).path.lstrip('/') or 'index.html'
        file = ROOT / path
        if file.is_file():
            mime = {'.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html'}.get(file.suffix, 'text/plain')
            request.fulfill(body=file.read_bytes(), content_type=mime)
        else:
            request.fulfill(status=404, body='Not found')
    page.route('http://game.test/**', route)
    page.goto('http://game.test/')
    page.wait_for_function('window.spaceInvaders?.getState().state === "ready"')
    page.screenshot(path=str(OUT / 'desktop-ready.png'))
    page.get_by_role('button', name='Launch mission').click()
    page.keyboard.down('ArrowLeft')
    page.wait_for_timeout(250)
    page.keyboard.up('ArrowLeft')
    assert page.evaluate('spaceInvaders.getState().player.x') < 480
    page.keyboard.down(' ')
    page.wait_for_timeout(300)
    page.keyboard.up(' ')
    assert page.evaluate('spaceInvaders.getState().shots.some(s => s.friendly)')
    page.keyboard.press('p')
    frozen = page.evaluate('spaceInvaders.getState().time')
    page.wait_for_timeout(200)
    assert page.evaluate('spaceInvaders.getState().time') == frozen
    page.get_by_role('button', name='Resume mission').click()
    page.select_option('#mode', 'coop')
    assert page.evaluate('spaceInvaders.getState().wingman.lives') == 3
    page.wait_for_timeout(700)
    assert page.evaluate('spaceInvaders.getState().shots.some(s => s.owner === "wingman")')
    page.evaluate('spaceInvaders.setInput({left:true, fire:true}, 500, "wingman")')
    old_x = page.evaluate('spaceInvaders.getState().wingman.x')
    page.wait_for_timeout(200)
    assert page.evaluate('spaceInvaders.getState().wingman.x') < old_x
    page.wait_for_timeout(1300)
    page.screenshot(path=str(OUT / 'desktop-coop.png'))
    page.select_option('#mode', 'ai')
    page.wait_for_timeout(1500)
    assert page.evaluate('spaceInvaders.getState().shots.some(s => s.friendly)')
    page.get_by_role('button', name='Sound off').click()
    assert page.get_by_role('button', name='Sound on').get_attribute('aria-pressed') == 'true'
    page.evaluate('spaceInvaders.pause()')
    page.screenshot(path=str(OUT / 'desktop-paused.png'))
    page.set_viewport_size({'width': 390, 'height': 844})
    page.select_option('#mode', 'coop')
    page.wait_for_timeout(200)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(OUT / 'mobile-coop.png'))
    # Real pointer capture requires a trusted pointer; exercise it through mouse.
    page.locator('[data-action="left"]').hover()
    before = page.evaluate('spaceInvaders.getState().player.x')
    page.mouse.down(); page.wait_for_timeout(200); page.mouse.up()
    assert page.evaluate('spaceInvaders.getState().player.x') < before
    page.goto('http://game.test/dist/space-invaders.html')
    page.wait_for_function('window.spaceInvaders?.getState().state === "ready"')
    page.get_by_role('button', name='Launch mission').click()
    assert page.evaluate('spaceInvaders.getState().state') == 'playing'
    page.screenshot(path=str(OUT / 'portable.png'))
    assert not errors, errors
    print(json.dumps({'result': 'passed', 'page_errors': errors, 'screenshots': str(OUT)}))
    browser.close()
