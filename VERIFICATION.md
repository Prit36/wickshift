# Wickshift: verification report

Every check below was run on this machine against the code in this folder. Each
row gives a result, the browser and viewport, and the evidence or the command
that reproduces it. Anything that needs hardware, a person or a real display I
did not have is marked **unverified**.

## Run, build, test

```
npm ci             # install from the lockfile
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle in dist/
npm run preview    # serve dist/ on http://localhost:4173
npm test           # vitest: physics replays, spec checks, refresh rates, save repair, centre of mass
```

Browser tools (Playwright, installed Chromium 1248 at
`%LOCALAPPDATA%/ms-playwright/chromium-1248/chrome-win64/chrome.exe`):

```
node tools/accept.mjs                               # production acceptance checks (defaults to the preview on :4173)
node tools/review.mjs                               # visual-review captures → captures/review/
node tools/flow.mjs                                 # bench flow by mouse and keyboard
node tools/touch.mjs                                # emulated touchscreen at 844×390
node tools/clip.mjs                                 # snap–launch–retry video → captures/clip/
node tools/shot.mjs <name> [w] [h] [query] [js]     # one capture
```

`flow`, `touch`, `review`, `clip` and `shot` use the dev server unless
`BASE=http://localhost:4173/` points them at the production preview. The
production page exposes its test handle (`window.__wickshift`) only with `?dev`;
the tools add it. Dev URL flags: `?plain` (grain, glow, shake and decorative
motion off), `?nolabels` (drawer labels off), `?overlay` (fixture, socket and
pivot overlay).

## Environment

- Windows 11 Pro, Node 26.5, Chromium 1248 headless via Playwright.
- Viewport 1366×768 at pixel ratio 1 unless a row says otherwise.
- The production rows ran on a clean copy (`npm ci` from the lockfile, then
  `npm run build`) served by `vite preview`.

**Totals on the final build.** `npm test` 45 passed (21 exploration runs skip
unless their environment flags are set). `accept.mjs` 38 of 38. `flow.mjs` 21 of
21. `touch.mjs` 8 of 8. `review.mjs` 34 captures with no page errors.

## AI slop rejection criteria

One row per criterion, run on the production build (`accept.mjs`, `review.mjs`).

| Reject this | Check in the game | Result | Evidence |
| --- | --- | --- | --- |
| A web dashboard wearing a game theme | Cold-load at 1366×768; the first useful click picks up a wheel; Dispatch retracts the drawer and the cart rolls from the same position under the same camera | PASS | The first click on the drawer selects the key wheel. At dispatch the chassis moved 0.00 mm and the camera did not change (`com` group). One full-viewport canvas stage: recesses cut in the drawer, a clamp hinged to the bench, a lever on a visible pivot. |
| Inventory buttons that differ only by label | Hide labels, cover the logo, pick out the key wheel, follow it through a drag, watch its hub turn about its bolt | PASS (seen) | `nolabels-1366`, `invalid-socket`. Each part keeps one silhouette in tray, hand and machine. The bench carries no logo. |
| A flat backdrop with controls painted in | Move a wheel to another socket and resize; the old hole is empty and the new axle agrees with the simulation | PASS | After a resize to 1280×720 the moved wheel is drawn once, and its hub sits 0.00 mm from the simulated axle (`com` group). |
| Noise and glow carrying the look | Effects off, 320×180: find the lamp, the loose wheel and the first curb | PARTIAL | `thumb-plain-320`: the lamp and the loose wheel read, and so does the paper lip off the bench. The envelope seam (the route's real curb) is 21 m away and not in the opening frame; see Known deviations. |
| Stock springs and toasts on every input | Invalid drop, then a correct fit, then retry during dispatch: one rejection, one fit, no late sounds or overlays | PASS | `slop` group: reject 1, fit 1. R pressed 60 ms after dispatch, while the clamp opens: no sound after R, no run voice, result, effects or simulation left. |
| UI that lies or fills space | Fit, move, remove, undo and relaunch the same wheel; stock and its recess agree at every step; the mark only after its condition and a delivery | PASS | `slop` group: after each step the stock, the drawer button's label and the painted recess (pixels sampled from the canvas) agree. Blue post is committed only by a delivery (`blue` group). |

## Acceptance tests for the production build

### Clean launch: PASS

`node tools/accept.mjs` (group `launch`), against the clean build.

- **Install and build.** `npm ci` installed 45 packages in 2 s; `npm run build` typechecks and bundles in about 0.2 s.
- **Bundle.** 370 kB JS (99 kB gzip) plus self-hosted Barlow Condensed and Source Sans 3.
- **Cold load (cache disabled).** Input-ready bench 109–121 ms after navigation start over three runs: 6 requests, 152 KiB transferred.
- **Requests and errors.** Every non-localhost request was set to abort; none was attempted. No console errors, no failed requests.
- **Test handle.** Absent from the production page without `?dev`.
- **First click.** The first click on the drawer picks up the key wheel.
- **Offline play.** The keyboard run below delivers with third-party requests blocked.

### Bench, launch and landing: PASS

| Check | Result | Evidence |
| --- | --- | --- |
| Move an installed wheel: the hollow mark sits at the new rig's centre of mass | PASS | `accept.mjs` `com`: solid 0.0118 m, hollow 0.0781 m. Fitting it gives a solid mark at exactly 0.0781 m. `test/com.test.ts`: the bench mark equals the dispatched cart's centre of mass to 1e-6 m for every starter, the long rig and the sprung shoe, at three lamp positions. |
| Cancel restores the original mark and stock | PASS | Escape mid-drag: no hollow mark, solid mark, build and stock unchanged. |
| Peek and return to the same selection | PASS | Hold V with the reel selected: the camera runs ahead 22 m. On release, camera and selection are identical. |
| A stable two-wheel build released on a flat for 120 ticks, drive off | PASS | `test/spec.test.ts`, three builds: rise under 5 mm, drift under 10 mm, no knock, no crack. |
| Blotter Drop: direct runner vs sprung shoe at matched entry, fork travel and peak lamp deceleration | PASS | Table below. |

`test/acceptance.test.ts` drops each rig tail-first onto a flat blotter.

- **Entry.** 2.2 m/s along and 2.2 m/s down; frame pitched 4° nose-up; lamp at the route's start (rear stop, −0.72 m).
- **Seat metric.** Velocity change over a 5-tick window at the lamp's seat, net of gravity. This is the crack metric.
- **Lamp body.** The lamp body's own single-tick peak, recorded alongside.

| Rig | Peak Δv (5 ticks) | Mean decel | Seat tick peak | Lamp body tick peak | Fork travel | Cracks |
| --- | --- | --- | --- | --- | --- | --- |
| Direct runner (runner socket 0, key wheel 4) | 4.13 m/s | 50 m/s² | 138 m/s² | 116 m/s² | 0 | 1 |
| Sprung shoe (fork socket 0 carrying the runner, key wheel 4) | 2.47 m/s | 30 m/s² | 38 m/s² | 62 m/s² | 17.4 of 30 cm | 0 |

- **Robustness.** The ordering holds for ±10% entry speed and the lamp 0.1 m further forward; the shoe is always more than 0.8 m/s gentler.
- **Fork preload.** A fitted fork's 28 N preload exceeds its static load, so the bench pose stays exact and nothing knocks on dispatch.

### Visual review: PASS (person-only items unverified)

Captures in `captures/review/` from `node tools/review.mjs`. All were viewed. On
the production preview they gave no page errors. Runs advance tick by tick
through the game's own step, so every frame is repeatable.

| Frame | What it shows | Result |
| --- | --- | --- |
| `first-1366` | First editable frame | PASS. Glass lamp lit at the cart's centre, loose key wheel in its recess, "Fit the key wheel" beside the empty mount. |
| `thumb-plain-320` | The same frame at 320×180 with `?plain&nolabels` (effects and labels off) | PARTIAL. The lamp's honey glass, the red butterfly key in the drawer and the buff paper lip off the bench all read. The envelope seam is not in the frame. |
| `nolabels-1366` | Labels off | PASS. The key wheel, reel and lever are told apart by silhouette. |
| `invalid-socket` | Key wheel held over a socket beside the reel | PASS. A hatched cross on that hole only, "Would rub the reel" beside it. |
| `ruler-lift` / `ruler-settled` | Ruler Rise, muted, reduced motion | PASS. Nose up 20° at tick 165, the moth reaches for the lamp, "Shift lamp forward" with its glyph beside the lamp. After Lamp forward the nose settles onto the ruler and the moth grips the rail. |
| `ruler-climb` | Cart on the ruler | PASS |
| `failure-landing` | The Night Counter, key wheel at the nose | PASS. "Key wheel took a hard landing" beside the chalk tick at the impact. Both retry actions sit at the edge; the cart stays in view. |
| `delivered-200ms` / `delivered-1s` | Envelope Lip delivery | PASS. The window lights with the clerk's silhouette. The slip takes its DELIVERED stamp. Next window is first and live. |
| `nc-scout-*`, `nc-peek-*` | The Night Counter at 1366 and 844 | PASS. See the Night Counter section. |
| `nc-long-roller`, `nc-compact-under-flap` | Both Night Counter paths at the decisive moment | PASS. The reel takes its stripe at tick 332; the flap lifts 12° over the compact runner. |
| `blotter-lip-844` | 844×390, just before the Blotter lip | PASS. The thumb controls sit clear of the landing; no clipping, double borders or scrolling. |
| `captures/clip/snap-launch-retry.webm` | Drag the wheel in, pull the lever, drive, R | Recorded (headless video). |

Before this pass the game had no WICKSHIFT wordmark at all. It now has a
hand-cut one on the routes view (`src/render/wordmark.ts`): nine paper letters
laid slightly off true over torn vermilion tape, with an ember over the I. The
bench carries no logo, so "cover the logo" is trivially met there.

### Physics across refresh rates: PASS

`test/clock.test.ts` drives the real `Sim` through the game's `FixedStepper`
(accumulator, 1/60 s ticks, 5-step catch-up cap) at 30, 60, 120 and 144 Hz, and
under uneven frames (61 ms every 7th frame, otherwise 9.3 ms).

- **Equality.** Outcome, tick count, final pose, cracks, ink and wind are bit-identical to each other and to the headless replay.
- **Runs.** The Night Counter long rig; the Blotter coast-over-the-lip run; and the Ruler Rise climb pair.
- **Climb pair.** Same build (key wheel 1, reel 4), same throttle `[[0,1,0]]` against `[[0,1,1]]`, so only the lamp changes. Lamp back stalls; lamp forward crests.
- **Stall.** A 2 s stall runs at most 5 ticks and drops the backlog.

This exercises the stepper and the simulation, not the `Game` render loop.
`accept.mjs` checks that only one frame loop runs (165 game frames for 165 page
frames per second).

### Input and saves: PASS (real hardware unverified)

| Check | Result | Evidence |
| --- | --- | --- |
| Complete a job by keyboard alone | PASS | `accept.mjs` `keyboard`, production build. Tab to the key wheel → Enter. Focus jumps to the first legal socket → Enter. Tab to the lever → Enter. Hold Space. Delivered after 18.7 s. Focus lands on Next window; Enter opens Ruler Rise. |
| Socket selection at pixel ratio 1, 2 and 125% zoom | PASS | Click the recess, then a socket: it fits there in all three. The backing store is 1366×768 at ratio 1 and 2732×1536 at ratio 2. 125% zoom is emulated as 1093×614 CSS px at ratio 1.25 (backing 1366×768). |
| Release a dragged wheel outside the canvas | PASS | The wheel returns; build and stock unchanged. |
| `pointercancel` mid-drag | PASS | The drag is abandoned; build and stock unchanged. |
| Touch: hold Drive and Lamp forward, release Lamp only | PASS | `touch.mjs` (emulated, 844×390, ratio 2). Lifting the lamp finger leaves Drive held and the spring still spending. |
| Alt+Tab during throttle | PASS (emulated) | A window `blur` while Space is held: pauses, clears held keys, and drive does not resume by itself. **Unverified** with a real Alt+Tab. |
| Touch the roller and fail, then touch it and deliver | PASS | Built with player actions: remove the runner, fit a spar at the nose (E to rotate), the reel on its tip. The first run inks the reel; R before the window commits no Blue post, in memory or in storage, and washes the stripe. The second run inks and delivers, and Blue post is stored before the stamp. |
| Refresh during the stamp | PASS | After reload: 4 deliveries, one mark, no held keys, no latched drive. |
| A setting changed just before a refresh | PASS | Mute all and Reduced motion, toggled on the pause slip and reloaded at once, survive. This needed a fix: a save still on its 120 ms timer was lost on reload; the page now flushes it on `pagehide`. |
| A save with one invalid blueprint | PASS | That route opens on its starter. Its earned mark and every other route's build and progress survive. Unit coverage in `test/save.test.ts`. |
| Bench flow by mouse | PASS | `flow.mjs`, 21 checks, on the production build: drag-to-fit, hollow mark, lever on press, R restore, undo/redo, locked lever, invalid fit with reason, Escape to pause, spar rotation, removed branch plus undo. |

### Frame pacing and cleanup: cleanup PASS; 60 Hz pacing unverified

| Check | Result | Evidence |
| --- | --- | --- |
| 20 dispatch/rebuild cycles: retry to an editable frame | PASS | Median 5 ms, p95 6 ms (target under 500 ms). |
| Physics bodies | PASS | Every run builds the same 6 bodies; none survive the rebuild. |
| Frame loops | PASS | One: game frames equal page frames. |
| Listeners and voices | PASS | Listeners on window, document and canvas: 25 before, 25 after. Focusable controls 9 → 9. Run-owned voices 0 (the room bed and music keep their own). |
| 30 s of foreground driving at 1366×768 | Headless only | 4931 frames, no stall over 50 ms. Game work per frame: median 0.7 ms, p95 1.3 ms, max 9.3 ms. Headless Chromium's frame clock is not locked to a display (median interval 6.1 ms), so this says nothing about a 60 Hz panel. **Unverified:** median and p95 frame interval on a 60 Hz reference display. |

## Reproducible blueprints and inputs (`npm test`)

Scripts are `[fromTick, drive, lamp]` segments, replayed headless at 60 Hz.
They live in `test/routes.test.ts`, `test/spec.test.ts` and `test/fixtures.ts`.

| Route | Build | Script | Result | Driving time |
| --- | --- | --- | --- | --- |
| Envelope Lip | key wheel socket 0 or 1, reel 4 | `[[0,1,0]]` | delivers, no crack, wind under 23% | 18.3 s |
| Envelope Lip (**Wind in hand**) | same | `[[0,1,0],[240,0,0],[480,1,0]]` | delivers with at least 26% wind | 18.7 s |
| Envelope Lip | same | `[[0,1,0],[180,0,0]]` | stalls short; the reason names the distance | — |
| Ruler Rise | key wheel 1, reel 4 | `[[0,1,0]]` | the nose lifts, it stalls | — |
| Ruler Rise | same | `[[0,1,1]]` | crests and delivers | 12.7 s |
| Ruler Rise (**Short order**) | key wheel 0, reel 4 | `[[0,1,0]]` | delivers, no spar | 13.2 s |
| Ruler Rise | long rig: key wheel 0, spar 4 with the reel on its tip | `[[0,1,0]]` | the longer wheelbase climbs without shifting | 13.3 s |
| Blotter Drop | starter (key wheel 0, reel 4) | `[[0,1,0]]` | delivers with one crack, named on the key wheel | 11.4 s |
| Blotter Drop (**Clear glass**) | sprung shoe | `[[0,1,0],[1000,1,1]]` (lamp forward on the runout) | delivers, no crack, more than 10% wind | 21.1 s |
| Blotter Drop (**Clear glass**) | sprung shoe | `[[0,1,0]]` (lamp left back) | delivers, no crack | — |
| Blotter Drop (**Clear glass**) | starter | `[[0,1,0],[220,0,1],[235,0,0],[400,1,0]]` | delivers, no crack | 12.5 s |
| Blotter Drop | starter | coast from 220 with the lamp left back | cracks | — |
| Blotter Drop | long rig | lamp back, level or forward | delivers each time | — |
| The Night Counter (**Blue post**) | long rig | `[[0,1,0]]` | the counter, inked roller, clean delivery | 9.6 s |
| The Night Counter | compact runner (starter): key wheel 0, runner 4 | `[[0,1,0]]` | the dip, the shelf, under the flap, clean, no ink | 12.4 s |
| The Night Counter | both | lamp back 0–150, then forward; and drive from tick 20, 40 or 60 | each build keeps its path | — |
| The Night Counter | key wheel 4, reel 0 | `[[0,1,0]]` | "Key wheel took a hard landing", snuffed | — |

**Driving-time target (15–40 s): partly met.** Envelope Lip and the Blotter shoe
run fall in the range. The faster winning runs on Ruler Rise (13 s), Blotter
Drop (11–13 s) and The Night Counter (10–12 s) come in under 15 s. I left the
courses as tuned rather than lengthen them after every outcome above was pinned.

## Lamp, rail and impacts

- **Travel.** End to end takes 36 ticks (0.6 s): top speed 2.88 m/s, then buffered stops that arrive at 0.4 m/s. The spec asks for roughly half a second.
- **Brake.** A speed-zero motor alone let the lamp creep about 1 cm on a long incline. The brake now also steers back to the release point, at the same 60 N limit.
  - On every pinned replay the lamp sits within 0.9 mm of where it was released.
  - A hard landing can push it past the brake for a moment (up to 21 mm on the Blotter coast landing); it then returns.
- **Load metric.** The glass feels the frame under it. Across the rail that is the chassis point under the lamp; along the rail it is the cart's centre of mass, because the rail motor is internal to the cart.
  - At rest it reads 0.83 m/s over the window (gravity).
  - Knock at 1.6, crack at 3.0. An impact group closes after 10 quiet ticks under 1.0.
  - Reversing the lamp on a flat peaks at about 1.5.
- **Envelope seam.** At full throttle the lamp peaks at 1.60 m/s, right on the knock line and well under a crack. The key wheel's touchdown on the seam rings a strike.
- **Blotter coast window.** Coasting with the lamp forward lands clean from every start between ticks 190 and 250.
- **Windows and long noses.** The longest legal nose (a spar out of the nose carrying a reel or a fork) reaches 3.0 m ahead of the lamp's glass.
  - Each window used to open only 2.2 m before its parcel stack. A long rig with the lamp back parked its reel on the stack, short of the window, and the rest message blamed the spring.
  - The windows on Ruler Rise, Blotter Drop and The Night Counter now open 3.3 m before the stack, and long rigs deliver with the lamp anywhere. Envelope Lip has no spars; its longest reach is 1.6 m.
- **Failure messages.**
  - A blow mostly along the frame names what was hit (for example "ran into the parcel stack").
  - One from below is a hard landing.
  - A fall is "Lamp fell into the drawer".

## The Night Counter: two paths

- **The props.**
  - A brass ruler (5.0 m near arm, 3.4 m far arm, damped) lies on a pencil.
  - Raised, its far end stops 0.2 m under the lip of the high counter.
  - A free-spinning blue ink roller sits on that lip.
  - Below is a lower shelf, now a teal blotter pad so it reads as its own surface.
  - A paper flap hinged at the counter's far end drapes to the shelf. Both levels meet on the same floor before one window.
- **High path.** A front reel climbs the lip while the ruler is still up. The long rig rides the counter, rolls down the top of the flap and delivers. A touch on the roller's upper half inks the stripe.
- **Low path.** A runner's toe cannot mount the lip, so the compact cart parks on the far arm with the drive held. Its weight past the pencil tips the ruler down to the shelf. It drives under the counter, lifts the flap from beneath and rejoins the approach.
- **Tuning harness.** `MATRIX=1 npx vitest run test/counter.explore.test.ts --disable-console-intercept`. Its defaults are the shipped values: step 0.2, density 4.5, damping 3, lamp 0.72.
  - The long rig is high and inked in 3 of 7 input policies: every one that keeps the lamp level or forward at full throttle.
  - The compact runner is low and clean in 6 of 7. The exception holds the lamp back the whole way.
  - Over counter step 0.15–0.25 m and ruler density 4–5, both recipes hold in all 9 cells.
- **Not exclusive.** A short wheeled cart with a reel at the nose also climbs the lip and can earn Blue post. The spec says a long rig *can* reach the roller.
  - A wheelbase-exclusive split measured infeasible: a ruler light enough to tip under a compact also throws the long rig, and one heavy enough to hold it tips too slowly to stop a cart.
  - The route's starter is the compact runner, so a first run takes the low path.
- **Scouting.** Scout (`nc-scout-1366`, `nc-scout-844`) frames the ruler, roller, counter, teal lower shelf and flap together. Hold V (`nc-peek-*`) shows the ruler and roller. The route slip draws the counter top solid and the lower way dashed under the dipped ruler.

## Playthrough (build order step 3)

**One shift, played through** (`accept.mjs` `shift`, production build): PASS.

- **Setup.** From a cleared save: Mute all and Reduced motion toggled on the pause slip, then a reload.
- **The four jobs.** Each was driven with real keys from its starter: Envelope Lip after fitting the key wheel; Ruler Rise with D held.
  - Before each delivery the next window was locked.
  - After it, Enter on Next window opened the next job.
  - The page was reloaded between jobs.
- **Results.**
  - Envelope Lip delivered in 18.3 s.
  - Ruler Rise delivered in 12.7 s and earned Short order.
  - Blotter Drop delivered in 11.4 s with one crack: the cracked-lamp finish.
  - The Night Counter delivered in 12.4 s.
- **Finale.** Next window after the fourth opened the finale.
- **After a final reload.** Four deliveries; mute and reduced motion still on.

The rest of step 3 ran in other groups:

| Item | Where |
| --- | --- |
| Removed branch plus undo | `flow.mjs`: a spar carrying the reel dropped on the drawer, then undo |
| Failed landing | The Night Counter, key wheel at the nose: "Key wheel took a hard landing" (`failure-landing`, `routes.test.ts`) |
| Optional mark on The Night Counter | Blue post earned and stored (`accept.mjs` `blue`) |
| Moth reach and grip with sound muted | `ruler-lift` / `ruler-settled`, muted with reduced motion |

**Unverified:** a first-time player's launch time and the one change they would
make after a failed run. No person played it.

## Viewports

`review.mjs` captures `bench-`, `routes-`, `finale-` and `pause-` at each size.
All 16 were viewed.

| Viewport | Bench | Routes | Finale (every window lit) | Pause slip |
| --- | --- | --- | --- | --- |
| 1280×720 | PASS | PASS | PASS | PASS |
| 1366×768 | PASS | PASS | PASS | PASS |
| 1920×1080 | PASS | PASS | PASS | PASS |
| 844×390 | PASS | PASS | PASS | PASS (all rows fit) |

At 844 the route slip shortens its profile and ends a long condition with "…"
rather than clipping. Thumb controls measure Drive 72 px and lamp 48 px (at
least 44).

## Known deviations

- **Seam and window not in the opening frame.** The spec's first 30 seconds say the player can see the first envelope lip and a dark receiving window beyond the cart. On Envelope Lip the seam is 21 m ahead and the window 46 m.
  - At the required 240–300 px cart the bench frame covers about 14 m, so neither is in it.
  - What is in view: the paper lip running off the bench.
  - The route slip's profile marks both. Hold V looks ahead to the seam; Scout pans to the window.
- **Short winning runs.** Several are under the 15 s end of the driving-time target (see above).
- **Lamp travel.** End to end takes 0.6 s against "roughly half a second".

## Not verified

- A first-time human playtest.
- Touch on a real device (emulated touch passes).
- Fullscreen in a headed browser (headless cannot enter fullscreen).
- Audio levels and mix. The sounds have not been heard by a person.
- Frame pacing on a real 60 Hz display; real 120/144 Hz displays (the stepper is tested at those rates).
- A real Alt+Tab (emulated blur passes).
