# Contributing to WorldGuard

Thanks for helping. A few principles keep the project trustworthy:

1. **One engine.** Rules live only in `engine/`. The website, server, CLI and Python package must not re-implement them.
2. **Measure, don't claim.** New behaviour comes with a test; new training claims come with held-out numbers (`node cli/worldguard.mjs eval`). Never hard-code progress, curves or scores.
3. **Keep the founding intent.** Update `docs/REQUIREMENTS_CHECKLIST.json` honestly (verified / partial / missing).
4. **Abstract threats only.** Villain and rogue mechanics are game abstractions. Do not add real exploit code, malware techniques, or biological/chemical procedures.
5. **No real-world side effects.** The simulator never controls real systems, credentials, devices or payments.

## Getting started

```bash
npm test                 # engine + server
npm run test:py          # Python package
npm run test:browser     # headless browser smoke test (needs: pip install playwright && playwright install chromium)
npm start                # http://localhost:8787
```

No build step and no runtime dependencies. If you change `engine/decision.js` or the trainer, retrain the shipped checkpoint with `node cli/worldguard.mjs train` and include the new held-out numbers in your PR.

## Good first contributions

* New task families (templates) and translations (`site/i18n.js`)
* Real-model benchmark results (`python -m worldguard eval …`)
* Laya / other decision-model adapters behind `engine/protocol.js`
* Accessibility and mobile polish
