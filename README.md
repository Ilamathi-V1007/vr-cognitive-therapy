# VR Cognitive Therapy

Affordable, adaptive cognitive-motor therapy for elderly patients, running in a phone browser with a Cardboard-class VR box. Free stack only.

## Modules
- `modules/kolam/` Module 1: Kolam Recall and Trace (draw-from-memory kolam; span, accuracy and speed scored in-game)
- `modules/rules/` Module 2: Rule-Switch Lamps (go/no-go + rule switching; reaction time, inhibition and switch cost scored in-game)
- `modules/mindhaven/` Mindhaven: a living-island world with its own 7 CMCI-scored, adaptive games (`core/games2.js`); each round unlocks a new island surprise
- `modules/hub/` Bloom: hub of CMCI-scored, adaptive therapy games (6 built in plus links to the two camera games) with a combined session report
- `core/` shared code: `handtracker.js` (MediaPipe), `storage.js` (IndexedDB)

## Run locally
ES modules need a web server (not file://). From the repo folder:
`python -m http.server 8000` then open http://localhost:8000/modules/kolam/

## Phone
The camera needs HTTPS. Use GitHub Pages: https://USERNAME.github.io/REPO/modules/kolam/

URL options: `?cam=environment|user` and `?mirror=0|1`.
