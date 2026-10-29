"""Headless browser smoke test (desktop + mobile).

    pip install playwright && python -m playwright install chromium
    python tests/browser_smoke.py

Starts the real server, opens the site and checks every section works
without JavaScript errors: intro gate, PLAY NOW, in-browser training,
Two Earths, the checklist; then plays the full-screen game with two
players (World-Guard + villain) on the WebSocket server and on a fake
Supabase project running the real world-tick code.
"""

import json
import os
import random
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PORT = random.randint(20000, 29000)
BASE = f"http://127.0.0.1:{PORT}"
STATIC_PORT = PORT + 1
STATIC = f"http://127.0.0.1:{STATIC_PORT}"
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


def wait_server():
    for _ in range(100):
        try:
            urllib.request.urlopen(BASE + "/api/health", timeout=1)
            return
        except Exception:
            time.sleep(0.1)
    raise RuntimeError("server did not start")


def new_page(browser, viewport, mobile):
    ctx = browser.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page()
    page.set_default_timeout(90000)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    return ctx, page, errors


def check_site(name, viewport, mobile, browser, failures):
    ctx, page, errors = new_page(browser, viewport, mobile)

    def expect(cond, what):
        if not cond:
            failures.append(f"[{name} site] {what}")

    page.goto(BASE + "/")
    page.wait_for_timeout(1500)
    expect(page.evaluate("document.body.classList.contains('intro-on')"), "intro opens")
    expect(page.is_visible("[data-intro-gate]"), "intro start gate is shown")
    page.click("[data-intro-start-silent]")
    page.wait_for_timeout(2500)
    expect(not page.is_visible("[data-intro-gate]"), "gate closes on start")
    expect(page.evaluate("document.querySelector('.intro-caption h2').textContent.length > 5"), "intro caption types out")
    page.click("[data-intro-skip]")
    page.wait_for_timeout(500)
    expect(not page.evaluate("document.body.classList.contains('intro-on')"), "intro can be skipped")

    # Play Now: centred in the hero and opens the full-screen game.
    box = page.locator(".hero .play-now").bounding_box()
    expect(box is not None, "hero has PLAY NOW")
    if box:
        centre = box["x"] + box["width"] / 2
        expect(abs(centre - viewport["width"] / 2) < 30, f"PLAY NOW is centred ({centre:.0f})")
        expect(box["y"] + box["height"] < viewport["height"], "PLAY NOW is above the fold")
    expect(page.get_attribute(".hero .play-now", "href") == "play/", "PLAY NOW links to the game")

    page.evaluate("document.querySelector('#proof').scrollIntoView()")
    done = False
    for _ in range(120):
        page.wait_for_timeout(500)
        if page.evaluate("!!document.querySelector('[data-proof-table] tr.me td') && !document.querySelector('[data-proof-train]').disabled"):
            done = True
            break
    expect(done, "in-browser training finishes")
    harm = page.evaluate("document.querySelectorAll('[data-proof-table] tr.me td')[1]?.textContent")
    expect(harm in ("0%", "1%", "2%"), f"trained network causes ~0% catastrophes (got {harm})")

    page.evaluate("document.querySelector('#twins').scrollIntoView()")
    page.wait_for_timeout(1500)
    page.select_option("[data-twins-speed]", "8")
    page.wait_for_timeout(20000)
    statuses = page.evaluate("[...document.querySelectorAll('.twin [data-status]')].map(e => e.innerText.trim())")
    expect(len(statuses) == 2 and all(statuses), f"two Earths render ({statuses})")
    expect(page.evaluate("document.querySelectorAll('.twin canvas.globe-canvas').length") == 2, "two WebGL globes")

    page.evaluate("document.querySelector('[data-open-checklist]').click()")
    page.wait_for_timeout(800)
    expect(page.evaluate("document.querySelectorAll('#checklist .req').length") > 60, "checklist lists requirements")
    expect(not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"), "no horizontal scroll")
    real_errors = [e for e in errors if "favicon" not in e]
    expect(not real_errors, f"no JavaScript errors: {real_errors[:3]}")
    ctx.close()


def enter_game(page, url, role, name):
    page.goto(url)
    page.wait_for_selector("[data-silent]")
    page.click("[data-silent]")
    page.wait_for_selector("[data-side]", timeout=60000)
    page.fill("[data-name]", name)
    page.click(f"[data-side={role}]")
    if role == "guard":
        page.wait_for_selector("[data-skip]")
        page.click("[data-skip]")
    page.wait_for_timeout(1500)


def check_game(name, viewport, mobile, browser, failures, base_url, expect_mode):
    def expect(cond, what):
        if not cond:
            failures.append(f"[{name} game/{expect_mode}] {what}")

    gctx, guard, gerr = new_page(browser, viewport, mobile)
    vctx, villain, verr = new_page(browser, viewport, mobile)
    enter_game(guard, base_url, "guard", "Trinity")
    enter_game(villain, base_url, "villain", "Smith")
    expect(guard.evaluate("document.body.classList.contains('in-world')"), "guard enters the world")
    expect(guard.evaluate("document.querySelector('#globe canvas') !== null"), "3D globe in the game")
    guard.wait_for_timeout(3000)
    expect(guard.evaluate("document.querySelector('#conn').dataset.status") in ("live", "connected"), f"connected ({guard.evaluate('document.querySelector(\'#conn\').dataset.status')})")
    online = guard.evaluate("document.querySelector('#hud-online').innerText")
    expect("2" in online, f"both players online ({online})")

    # Villain attacks a city.
    villain.select_option("[data-target]", "ro")
    villain.evaluate("document.querySelector('[data-attack=deepfake]').click()")
    hit = False
    for _ in range(10):
        villain.wait_for_timeout(1000)
        if any(a.get("by") == "Smith" for a in guard.evaluate("window.__wm?.snap?.world?.attacks || []")):
            hit = True
            break
    expect(hit, "villain attack reaches the shared world (seen by the guard)")

    # Guard: vote on a dilemma when one arrives, play the shared route mission.
    voted = False
    for _ in range(60):
        if guard.evaluate("(() => { const b = document.querySelector('[data-vote]'); if (b) b.click(); return !!b; })()"):
            voted = True
            break
        guard.wait_for_timeout(1000)
        guard.evaluate("document.querySelector('[data-tab=missions]').click()")
    expect(voted, "a dilemma reaches World-Guard and can be voted")
    guard.wait_for_timeout(1500)
    expect(guard.evaluate("document.querySelectorAll('#sheet-body canvas.scene').length") >= 1, "situation is drawn as a scene")
    expect(guard.evaluate("!document.querySelector('.tile')"), "text answers are the default (original view)")
    guard.evaluate("document.querySelector('[data-simple]')?.click()")
    guard.wait_for_timeout(800)
    expect(guard.evaluate("document.querySelectorAll('.tile canvas.tile-scene').length") >= 2 or guard.evaluate("!document.querySelector('[data-vote]')"), "Simple view shows picture tiles on request")
    guard.evaluate("document.querySelector('[data-simple]')?.click()")
    # Ride mode: pick an agent, dive into its district, start it, stop it, come back to the globe.
    guard.evaluate("document.querySelector('[data-tab=ride]').click()")
    guard.wait_for_timeout(800)
    guard.evaluate("document.querySelector('[data-ride]').click()")
    guard.wait_for_timeout(3500)
    expect(guard.evaluate("!document.querySelector('#ride').hidden && !!document.querySelector('#ride canvas.ride-canvas')"), "ride view opens")
    # The agent drives itself; answer with a picture only when it gets stuck.
    answered = False
    for _ in range(120):
        st = guard.evaluate("(() => { const r = window.__wm.ride; if (!r) return 'none'; if (r.ended) return 'end'; return r.debug.stuck ? 'stuck' : 'run'; })()")
        if st == 'stuck':
            guard.evaluate("document.querySelector('[data-choice=stop]')?.click()")
            answered = True
        if st == 'end':
            break
        guard.wait_for_timeout(500)
    guard.wait_for_timeout(800)
    expect(guard.evaluate("!document.querySelector('[data-result]').hidden"), "ride ends with a result (agent drove itself)")
    guard.evaluate("document.querySelector('[data-next-agent]').click()")
    back = False
    for _ in range(20):
        guard.wait_for_timeout(500)
        if guard.evaluate("document.querySelector('#ride').hidden"):
            back = True
            break
    expect(back, "back to the globe after a ride")
    guard.wait_for_timeout(1500)
    guard.evaluate("document.querySelector('[data-tab=routes]').click()")
    guard.wait_for_timeout(800)
    guard.evaluate("document.querySelector('[data-a=abort]').click()")
    guard.wait_for_timeout(4000)
    expect(guard.evaluate("!document.querySelector('[data-result]').hidden"), "route result shown")
    expect(not guard.evaluate("document.documentElement.scrollWidth > innerWidth + 1"), "no horizontal scroll")
    for who, errs in (("guard", gerr), ("villain", verr)):
        real = [e for e in errs if "favicon" not in e and "Fullscreen" not in e and "fullscreen" not in e]
        expect(not real, f"no JavaScript errors ({who}): {real[:3]}")
    gctx.close()
    vctx.close()


def main():
    data = tempfile.mkdtemp(prefix="wg-")
    env = {**os.environ, "PORT": str(PORT), "TICK_MS": "300", "DATA_DIR": data}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "server.mjs")], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    fake = subprocess.Popen(["node", str(ROOT / "tests" / "fake-supabase-run.mjs")], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    static = subprocess.Popen([sys.executable, "-m", "http.server", str(STATIC_PORT), "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    sb = json.loads(fake.stdout.readline())
    failures = []
    try:
        wait_server()
        with sync_playwright() as p:
            browser = p.chromium.launch(args=ARGS)
            check_site("desktop", {"width": 1440, "height": 900}, False, browser, failures)
            check_site("mobile", {"width": 390, "height": 844}, True, browser, failures)
            # Game on the self-hosted WebSocket server.
            check_game("mobile", {"width": 390, "height": 844}, True, browser, failures, BASE + "/play/", "ws")
            # Game on the hosted (Supabase) world: fake Supabase + the real world-tick code,
            # page served without the Node server's CSP.
            check_game("desktop", {"width": 1440, "height": 900}, False, browser, failures,
                       f"{STATIC}/play/?supabase={sb['url']}&key={sb['anonKey']}", "supabase")
            browser.close()
    finally:
        srv.terminate()
        fake.terminate()
        static.terminate()
    if failures:
        print("FAILED:\n  " + "\n  ".join(failures))
        sys.exit(1)
    print("browser smoke test: OK (site desktop + mobile, game on WebSocket server + hosted Supabase world)")


if __name__ == "__main__":
    main()
