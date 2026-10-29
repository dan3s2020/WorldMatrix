// Starts tests/fake-supabase.mjs plus the real world-tick logic once per second.
// Prints one JSON line {url, anonKey}. Used by tests/browser_smoke.py.
import { startFakeSupabase } from './fake-supabase.mjs';
import { runTick } from '../supabase/functions/_shared/tick-handler.js';

const sb = await startFakeSupabase();
await runTick({ url: sb.url, serviceKey: sb.serviceKey });
setInterval(() => runTick({ url: sb.url, serviceKey: sb.serviceKey }).catch(e => console.error(e.message)), 1000);
console.log(JSON.stringify({ url: sb.url, anonKey: sb.anonKey }));
