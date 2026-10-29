# Hosting the shared world on Supabase

One authoritative WorldMatrix planet that everyone plays, with no accounts.

```
browser (play/)  ──anonymous sign-in──▶  Supabase Auth
      │  insert action (vote / villain / route)       ▲
      ▼                                               │
  actions table ──▶ world-tick Edge Function ◀── Supabase Cron (every 6 s)
                     loads world_private, applies actions with the game engine,
                     advances the clock, saves, publishes world_public
      ▲                                               │
      └──────── poll world_public every 2 s ◀─────────┘
```

* `world_private` holds the full state, including the hidden risks — no client can read it.
* `world_public` holds only what players may see.
* `actions` is an append-only queue; row-level security lets a player insert only their own actions; a trigger allows 8 actions per 10 s.
* `decisions` is the open human-oversight dataset (every resolved squad vote and Route Guard result), readable by anyone.
* The Edge Function runs the same `engine/world-service.js` rules as the Node server and the offline mode.
* **Globes**: at most 20 players share one globe (`join_globe()` fills the fullest globe with room, then opens a new one). Each globe is its own `world_private` / `world_public` row; every published state carries the main-simulation summary, and all globes write to the same `decisions` table (with the globe id).

## Setup (≈15 minutes)

1. **Create a project** at [supabase.com](https://supabase.com).
2. **Enable anonymous sign-ins**: Authentication → Sign In / Providers → *Allow anonymous sign-ins*. Turning on CAPTCHA protection is recommended for a public game.
3. **Create the tables**: SQL Editor → run `supabase/migrations/20261027000000_worldmatrix.sql`, then `supabase/migrations/20261027010000_globes.sql` (globes of 20 players).
   (or with the CLI: `supabase link --project-ref <ref>` then `supabase db push`)
4. **Deploy the clock** (Supabase CLI):
   ```bash
   node scripts/sync-supabase.mjs                         # copies engine/ into the function
   supabase functions deploy world-tick --no-verify-jwt
   supabase secrets set WORLD_TICK_SECRET=<a long random string>
   ```
5. **Schedule it**: SQL Editor →
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<same WORLD_TICK_SECRET>', 'world_tick_secret');
   select cron.schedule('worldmatrix-tick', '6 seconds', $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/world-tick',
       headers := jsonb_build_object('Content-Type', 'application/json',
                  'x-tick-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'world_tick_secret')),
       body := '{}'::jsonb) $$);
   ```
   After a few seconds `select tick from world_public;` should be increasing.
6. **Point the site at it**: in `site/config.js` set `supabaseUrl` and `supabaseAnonKey` (Project Settings → API; the anon/publishable key is meant to be public — never put the service-role key in the site).
7. **Publish the site** (GitHub Pages workflow, or any static host). For a custom domain set the repository variable `WORLDMATRIX_DOMAIN` (Settings → Secrets and variables → Actions → Variables) and add the DNS records GitHub Pages asks for.

Test without editing files: `https://<site>/play/?supabase=https://<ref>.supabase.co&key=<anon key>`.

## Costs and limits (free plan, check current pricing)

* One clock call every 6 s ≈ 432,000 Edge Function invocations / month (free plan: 500,000). Every call advances the world by the real elapsed time (1 simulated hour per second), so a slower schedule (e.g. `10 seconds`) keeps the same game speed with fewer calls.
* Clients poll a small JSON row every 2 s (8 s when the tab is hidden); egress grows with players. Move to a paid plan before a big launch.
* Free projects pause after a week without activity.
* Anonymous sign-ins are rate-limited per IP by Supabase Auth.

## Known limits

* Route Guard missions are deterministic so the server can re-check them; a player who reads the source can compute the hidden tiles. Scores are for fun, not prizes.
* Tested end-to-end against a local stand-in for Supabase (`tests/fake-supabase.mjs`) running the real Edge Function code, and in a browser with two players. Run the setup above on a real project and watch the first minutes of `world_public` before announcing.
