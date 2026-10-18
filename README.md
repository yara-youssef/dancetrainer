# Dance Trainer

Practise dance and conditioning positions in front of your camera and get live
feedback on your form: "lift your working knee higher", "round your arms",
"point your foot", "your hips are sagging"…

Everything runs in the browser. Pose detection uses
[MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker),
so no video ever leaves your device.

## Movements

Movements are tracked over time: every repetition is counted, judged, and its
verdict read aloud ("3", "Double! Clean.", "Rep 4. Go lower…"). Film yourself and
use *Analyse a video* to review a recording (played at half speed for accuracy).

| Movement | Camera | What it checks per rep |
| --- | --- | --- |
| 🌀 **Pirouette** | Facing | Counts rotations (single, double…) · passé held through the turn · standing leg straight · upright · steady landing |
| 💪 **Push-up** | Side-on, camera at floor height | Depth (elbows to ~90°) · hips not sagging or piking · controlled tempo |

Turns are counted from the face disappearing and the shoulders swapping sides as
you rotate. Fast turns can blur, so use good light, and the back camera on a phone.

## Positions

| Position | Camera | What it checks |
| --- | --- | --- |
| 🩰 **Passé (retiré)** | Facing | Standing leg straight · toe at the standing knee · knee turned out · foot pointed · hips level · torso upright · shoulders level · arms softly rounded |
| 🦢 **Arabesque** | Side-on | Standing leg straight · back leg stretched · back leg height · foot pointed · chest lifted · front arm forward at shoulder height |
| 🩰 **Attitude derrière** | Side-on | Standing leg straight · back knee bent 90–130° · knee at hip height and above the foot · foot pointed · chest lifted · one arm en haut |
| 🦶 **Relevé** | Side-on, camera low | Heels high · knees straight · body stacked over the feet · pelvis neutral (no seat out / hips forward) |
| 🎀 **Plié in second** | Facing | Knee bend depth · knees tracking over toes · stance width · spine upright · pelvis level · arms in second, softly rounded |
| ✨ **Tendu à la seconde** | Facing | Both legs straight · foot pointed · foot extended to the side · weight over standing leg · hips/shoulders level · arms in second |
| 🌳 **Tree Pose** | Facing | Standing leg straight · foot off the knee joint · knee opening out · hips level · spine tall · palms together |
| ⚔️ **Warrior II** | Facing | Front knee ~90° · knee over ankle · back leg straight · arms straight at shoulder height · torso upright |
| 🐕 **Downward Dog** | Side-on, camera at floor height | Inverted-V hip angle · arms straight · long line wrists→hips · legs straight · heels down · head relaxed |
| 🧱 **Plank** (high or forearm) | Side-on, camera at floor height | Hips not sagging/piking · hands (or elbows) under shoulders · arms · legs straight · neck neutral |
| 📐 **Side Plank** (hand or forearm) | Facing, camera at floor height | Hips lifted in one line · support under the shoulder · supporting arm · legs straight · head in line |

Each position has an illustration of the correct form (on the cards, on the
setup screen, and as a thumbnail during practice that marks the body part to fix).
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

### On your phone

Phone cameras are usually much better than laptop webcams. Browsers only allow
camera access over HTTPS, so either:

- **Deploy to GitHub Pages (recommended).** In the repo's *Settings → Pages*, set
  *Source* to **GitHub Actions**. Every push to `main` then publishes the app to
  `https://<user>.github.io/dancetrainer/`; open that on your phone.
- **Run it from your computer over Wi-Fi.** Run `npm run cert` once (creates a
  self-signed certificate in `.cert/`), then `npm run dev:phone` and open the
  printed `https://<your-computer's-IP>:5173` address on your phone. Accept the
  certificate warning.

Prop the phone up so it sees your whole body. The feedback is shown in large
text over the video so you can read it from a few metres away. *Switch camera*
toggles between the selfie and the (usually sharper) back camera, and the screen
stays awake while the camera runs.

The voice coach always uses an English voice (otherwise browsers use the system
language's voice, e.g. a German accent). Pick a different one from the *Voice* menu.

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
- Joint angles use the larger of the 2D image angle and MediaPipe's 3D estimate:
  a straight limb always looks straight in 2D, while the 3D estimate tends to
  under-read straight limbs. The catch is that a knee bending straight towards
  the camera can look straight from the front.
- `src/movements/*.ts` hold the movements. Each creates a tracker: a small state
  machine fed every frame that detects the start and end of a repetition, collects
  measurements in between and returns a verdict per rep.
- `src/pose/engine.ts` smooths landmarks, debounces flickering results, scores
  form and runs the hold timer. `src/pose/coach.ts` decides what to say aloud
  without nagging.

### Adding a position

Create `src/poses/<name>.ts` with `definePose({...})` (see `plank.ts` for a
compact example), add it to `src/poses/index.ts`, and add a few synthetic
skeleton tests in `src/poses/__tests__/`. `__tests__/real/` holds landmarks
MediaPipe produced from a real photo, so rules are also checked against real data. Thresholds are plain
numbers in each check, so they're easy to tune once you've tried them on yourself.
