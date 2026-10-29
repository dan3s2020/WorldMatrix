// Supabase Edge Function: advances the shared WorldMatrix world.
// Deploy:  supabase functions deploy world-tick --no-verify-jwt
// Secret:  supabase secrets set WORLD_TICK_SECRET=<long random string>
// Called every few seconds by Supabase Cron (see supabase/migrations and docs/SUPABASE.md).
import { runTick } from '../_shared/tick-handler.js';

Deno.serve(async req => {
  const secret = Deno.env.get('WORLD_TICK_SECRET');
  if (!secret || req.headers.get('x-tick-secret') !== secret) return new Response('forbidden', { status: 403 });
  try {
    const result = await runTick({ url: Deno.env.get('SUPABASE_URL')!, serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! });
    return Response.json(result);
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
});
