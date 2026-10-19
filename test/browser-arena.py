"""Real HTTP/WebSocket arena smoke. Start npm start, then run this script.
ARENA_URL defaults to http://127.0.0.1:3000. Requires Python Playwright/Chromium.
"""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.environ.get('ARENA_URL','http://127.0.0.1:3000')
out=Path('test-results/arena');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1400})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'/arena')
 page.wait_for_function('window.spaceInvaders?.online && document.getElementById("arena-status").textContent.includes("Connected")')
 page.get_by_role('button',name='Launch mission').click()
 page.wait_for_function('spaceInvaders.getState().state === "playing" && spaceInvaders.getState().wingman')
 start=page.evaluate('spaceInvaders.getState().player.x')
 page.keyboard.down('ArrowLeft');page.wait_for_timeout(200);page.keyboard.up('ArrowLeft');page.wait_for_timeout(150)
 assert page.evaluate('spaceInvaders.getState().player.x')<start
 claim=page.request.post(base+'/api/claim',data={'role':'wingman','name':'Browser agent test'}).json()
 before=page.request.get(base+'/api/state').json()
 page.request.post(base+'/api/action',data={**claim,'action':{'left':True,'fire':True},'durationMs':150})
 page.wait_for_timeout(220)
 state=page.request.get(base+'/api/state').json()
 assert state['wingman']['x']<before['wingman']['x']
 assert abs(state['player']['x']-before['player']['x'])<1
 page.screenshot(path=str(out/'coop-agent.png'))
 page.get_by_role('button',name='Pause game',exact=True).click()
 page.wait_for_function('spaceInvaders.getState().state === "paused"')
 page.get_by_role('button',name='Resume mission').click()
 page.wait_for_function('spaceInvaders.getState().state === "playing"')
 page.locator('summary').click()
 page.get_by_role('button',name='Train local pilot').click()
 page.wait_for_function('document.getElementById("training-status").textContent.includes("Training reward")',timeout=60000)
 page.select_option('#provider','learned');page.get_by_role('button',name='Apply',exact=True).click()
 page.wait_for_function('document.getElementById("agent-status").textContent.includes("Learned policy")')
 page.wait_for_function('document.activeElement.id === "game"')
 page.set_viewport_size({'width':390,'height':1000});page.wait_for_timeout(300)
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 page.screenshot(path=str(out/'mobile-learning.png'))
 # A disconnect clears human ownership; a later connection can claim it again.
 page.reload();page.wait_for_function('document.getElementById("arena-status").textContent.includes("Connected")')
 page.wait_for_timeout(200)
 assert not errors,errors
 print(json.dumps({'result':'passed','errors':errors,'screenshotDirectory':str(out)}))
 b.close()
