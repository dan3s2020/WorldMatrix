# Security and safety policy

## Scope

* `engine/`, `site/`, `cli/`, `python/` contain no network access to third parties, no credential handling and no execution of model output. LLM replies are parsed against a closed list of action ids; anything else is rejected.
* `server/server.mjs` is a small public-facing service: static files from an allow-list of folders, a WebSocket endpoint with message validation, size limits and per-connection rate limits. It stores only the world state and anonymous decision logs.
* The website loads everything from its own origin (Three.js is vendored); the server sends a restrictive Content-Security-Policy.

## Content policy

Villain and rogue mechanics are abstract game rules. Contributions must not add real exploit code, malware techniques, or biological/chemical procedures.

## Reporting

Please report vulnerabilities privately through GitHub's "Report a vulnerability" (Security tab) rather than a public issue. Include steps to reproduce; do not include live exploit data or personal information.
