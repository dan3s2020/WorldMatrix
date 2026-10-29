# Shared world (multiplayer, no accounts)

```bash
node server/server.mjs                     # PORT=8787 by default
PORT=80 TICK_MS=1000 DATA_DIR=/var/lib/worldguard node server/server.mjs
docker build -t worldguard . && docker run -p 8787:8787 -v wg-data:/app/server/data worldguard
```

* One world per globe: at most `SHARD_SIZE` players (default 20) per globe; new players fill the fullest globe with room, then a new globe opens. Every globe sees the main-simulation summary (`GET /api/main`); empty globes close after 10 minutes (globe 1 always runs). One tick = one simulated hour (`TICK_MS`, default 1 s).
* Players are anonymous (random callsign, optional nickname of 3–20 letters/digits). Factions: `guard` (World-Guard), `villain`, `observer`.
* World-Guard votes on dilemmas: quorum is half of the guardians online; majority wins; a lone vote is applied after 8 simulated hours. Villains spend compute credits (start 12,000, +150/tick, max 60,000; 1.5 s cooldown).
* Route Guard: one shared mission every 600 simulated hours; the server re-evaluates every submitted route.
* The world is saved every minute to `DATA_DIR/world.json`; after an extinction it resets with a new seed one minute later.
* `DATA_DIR/decisions.jsonl` collects human decisions (no personal data beyond the callsign).
* Endpoints: `GET /api/health`, `GET /api/state`, WebSocket `/ws`. Only the site, `play/`, `engine/`, `vendor/`, `data/`, `docs/` are served.

The same rules (`engine/world-service.js`) run on the Supabase host — see [SUPABASE.md](SUPABASE.md).

## Protocol (JSON text frames)

Client → server

| message | meaning |
|---|---|
| `{"t":"hello","role":"guard","name":"Ana"}` | set faction / nickname |
| `{"t":"vote","dilemma":17,"choice":"insist_safe"}` | vote on a dilemma (World-Guard) |
| `{"t":"villain","attack":"worm","city":"ro"}` | villain action (see `VILLAIN_ACTIONS`) |
| `{"t":"route","seed":"…","path":[[3,8],[3,7],…],"scans":[[2,5]]}` or `{"t":"route","seed":"…","abort":true}` | Route Guard decision |
| `{"t":"agents"}` | all agents' decision histories |

Server → client: `welcome`, `state` (every tick), `you`, `result`, `decided`, `attack`, `agents`.

The server validates every message and rate-limits each connection. Hidden episode state (the true risk) never leaves the server.

## Hosting the public world

GitHub Pages serves the website; the shared world runs on Supabase ([SUPABASE.md](SUPABASE.md)) or on this server on any Node host (a small VPS, Fly.io, Render, Railway…) and open the site from that host, or point a Pages build to it with `?server=wss://your-host/ws`.
