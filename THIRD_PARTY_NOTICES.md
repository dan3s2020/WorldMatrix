# Third-party notices

| Component | Version | License | Location |
|---|---|---|---|
| Three.js | r170 (`build/three.module.min.js`, git tag `r170`) | MIT | `vendor/three/` (license: `vendor/three/LICENSE`) |
| Natural Earth 1:110m land | nvkelso/natural-earth-vector @ `ca96624` | Public domain | `data/land-110m.json` (simplified rings), terms: `data/NATURAL-EARTH-LICENSE.md` |

`data/land-110m.json` keeps only the outer ring of each land polygon, rounded to 0.1°. It is used for the globe texture, the land dot cloud and the intro animation.

No other third-party code is shipped. Optional Python extras (`python[train]`: TRL, Transformers, Datasets, PEFT, Accelerate) are installed by the user under their own licenses.
