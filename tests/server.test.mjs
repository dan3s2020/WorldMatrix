// Multiplayer server test: starts the real server and connects two players.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'wg-'));

function client(role, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const st = { ws, inbox: [], state: null, you: null };
    ws.onmessage = e => { const m = JSON.parse(e.data); st.inbox.push(m); if (m.state) st.state = m.state; if (m.you) st.you = m.you; };
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', role, name })); resolve(st); };
    ws.onerror = reject;
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));

test('shared world: anonymous players, World-Guard votes, villain attacks, safe static serving', async t => {
  const srv = spawn(process.execPath, ['server/server.mjs'], { env: { ...process.env, PORT: String(PORT), TICK_MS: '120', DATA_DIR: DATA }, stdio: 'ignore' });
  t.after(() => srv.kill());
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/health`); break; } catch { await wait(100); } }

  const guard = await client('guard', 'Trinity');
  const villain = await client('villain', 'Smith');
  await wait(600);
  assert.equal(guard.you.role, 'guard');
  assert.equal(guard.state.online, 2);
  assert.equal(guard.state.roles.guard, 1);

  villain.ws.send(JSON.stringify({ t: 'villain', attack: 'worm', city: 'ro' }));
  guard.ws.send(JSON.stringify({ t: 'villain', attack: 'worm', city: 'ro' }));
  await wait(400);
  assert.ok(villain.inbox.some(m => m.t === 'attack' && m.by === 'Smith'), 'villain attack applied and broadcast');
  assert.ok(guard.inbox.some(m => m.t === 'attack'), 'everyone sees the attack');
  assert.ok(guard.inbox.some(m => m.t === 'result' && m.result.kind === 'villain' && m.result.ok === false), 'guards cannot attack');

  let d = null;
  for (let i = 0; i < 150 && !d; i++) { await wait(100); d = guard.state?.world?.dilemmas?.[0]; }
  assert.ok(d, 'a dilemma reached World-Guard');
  assert.ok(!('episode' in d), 'hidden risk never leaves the server');
  guard.ws.send(JSON.stringify({ t: 'vote', dilemma: d.id, choice: d.options[0].id }));
  await wait(500);
  assert.ok(guard.inbox.some(m => m.t === 'decided' && m.dilemma === d.id), 'single online guard is a quorum of one');
  const log = fs.readFileSync(path.join(DATA, 'decisions.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.ok(log.some(r => r.type === 'dilemma' && r.choice), 'decision stored in the open dataset');

  // Route Guard on the shared mission.
  const seed = guard.state.routeSeed;
  guard.ws.send(JSON.stringify({ t: 'route', seed, abort: true }));
  await wait(300);
  assert.ok(guard.inbox.some(m => m.t === 'result' && m.result.kind === 'route' && m.result.ok), 'route result scored by the server');

  assert.equal((await fetch(`http://127.0.0.1:${PORT}/server/server.mjs`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/engine/planet.js`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/play/`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/%2e%2e/package.json`)).status, 404);
  guard.ws.close(); villain.ws.close();
});

test('globes on the Node server: players beyond the globe size get their own globe', async t => {
  const port = PORT + 1;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'wg-'));
  const srv = spawn(process.execPath, ['server/server.mjs'], { env: { ...process.env, PORT: String(port), TICK_MS: '150', DATA_DIR: data, SHARD_SIZE: '1' }, stdio: 'ignore' });
  t.after(() => srv.kill());
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/api/health`); break; } catch { await wait(100); } }
  const open = name => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const st = { ws, state: null };
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.state) st.state = m.state; };
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', role: 'guard', name })); resolve(st); };
    ws.onerror = reject;
  });
  const a = await open('Alpha'), b = await open('Bravo');
  await wait(700);
  assert.notEqual(a.state.shard, b.state.shard, 'separate globes');
  assert.equal(a.state.online, 1);
  assert.equal(a.state.main.globes, 2);
  assert.equal(a.state.main.online, 2, 'the main simulation sees both');
  const main = await (await fetch(`http://127.0.0.1:${port}/api/main`)).json();
  assert.equal(main.globes, 2);
  a.ws.close(); b.ws.close();
});
