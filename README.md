# Dance Trainer

Practise dance and conditioning positions in front of your camera and get live
feedback on your form: "lift your working knee higher", "round your arms",
"point your foot", "your hips are sagging"…

Everything runs in the browser. Pose detection uses
[MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker),
so no video ever leaves your device.

## Positions

| Position | Camera | What it checks |
| --- | --- | --- |
| 🩰 **Passé (retiré)** | Face the camera | Standing leg straight · toe at the standing knee · knee turned out · foot pointed · hips level · torso upright · shoulders level · arms softly rounded |
| 🐕 **Downward Dog** | Side view, camera at floor height | Inverted-V hip angle · arms straight · long line wrists→hips · legs straight · heels down · head relaxed |
| 🧱 **Plank** (high or forearm) | Side view, camera at floor height | Hips not sagging/piking · hands (or elbows) under shoulders · arms · legs straight · neck neutral |

The skeleton turns green where your form is right and red/amber where it needs
work. The most important correction is shown at the top and read aloud
(toggle with *Voice*). A hold timer tracks how long you keep the position with
no major faults. You can also analyse a still photo instead of the live camera.

## Running it

```sh
npm install
npm run dev      # open the printed URL and allow camera access
npm test         # unit tests for the form rules
npm run build    # type-check and production build
```

Camera access needs `localhost` or HTTPS. To try it on your phone, deploy the
`dist/` folder to any static host with HTTPS (e.g. GitHub Pages, Netlify).

The pose model (~9 MB) is downloaded from Google's model bucket on first use.
To self-host it, download
[`pose_landmarker_full.task`](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task)
into `public/models/` and build with
`VITE_POSE_MODEL_URL=/models/pose_landmarker_full.task`.

## How it works

```
camera → MediaPipe (33 body landmarks) → smoothing → pose rules → debounce → UI + voice
```

- `src/pose/detector.ts` loads MediaPipe and turns results into `PoseFrame`s
  (image landmarks for "is this level/vertical?", 3D world landmarks for joint angles).
- `src/poses/*.ts` hold one file per position. Each has a `prepare` step
  (are you in the position yet? which leg is working? which side faces the
  camera?) and a list of checks in priority order. A check measures something
  (an angle, a height) and grades it against a band: inside is ✓, slightly
  outside is "almost", further out is a correction.
- `src/pose/engine.ts` smooths landmarks, debounces flickering results, scores
  form and runs the hold timer. `src/pose/coach.ts` decides what to say aloud
  without nagging.

### Adding a position

Create `src/poses/<name>.ts` with `definePose({...})` (see `plank.ts` for a
compact example), add it to `src/poses/index.ts`, and add a few synthetic
skeleton tests in `src/poses/__tests__/poses.spec.ts`. Thresholds are plain
numbers in each check, so they're easy to tune once you've tried them on yourself.
