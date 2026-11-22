# WICKSHIFT

A build-and-run physics puzzle on a midnight desk. Pin desk junk together on a cork
board: matchsticks, shirt buttons, clockwork keys, match rockets, paper sky lanterns,
peg springs, paperclip hooks, paper umbrellas, party balloons, rubber erasers and
brass coins. Then launch it and get **the lamp** to the lit window.

**The lamp is everything at once:**

- **Cargo:** deliver it to the window.
- **Fuel:** rockets and lanterns burn its flame.
- **Health:** hard knocks shake it, upside down spills it, ink puts it out.
- **Light:** it is the warm glow you follow.

So every fire part is a trade between getting there and arriving lit.

> **Status: three worlds, 13 jobs, 12 parts.** The Desk teaches the basics, the
> Bookshelf adds drops, swings, balloons and candles, and the Mantelpiece mixes them
> over the hearth. Every job is replayed by at least two different tested builds.

## Why this version exists

The Deliveries redesign (tricks, stamps, shop) had stopped being a building game. It
was a cart on a hill, which made it read as a copy of a driving game, and most of its
systems didn't change how you play. This version goes back to the original brief,
"building and running", and drops everything that doesn't feed that loop.

## The loop

1. **Bench.** Read the job. Drag between pins to lay matchsticks, drag parts onto stick ends, and tap a part to aim it. The bench sits at the level's start, so what you build is exactly what spawns.
2. **Go.** The build runs with real physics. You work its controls: hold **Drive**, hold **Rockets**, hold **Lanterns**, hold **Umbrella**, tap **Springs**, tap **Hook** (tap again to let go).
3. **Rebuild.** Press R to go straight back to the bench with your build intact. Change one thing, then go again.

There are three stars per job: **deliver it lit**, **pick up the letter**, and the job's own challenge (keep 90% of the flame, use only 2 matchsticks, no rockets, and so on).

## Design rules

1. **Every part enables something no other part can.** There are no stat upgrades.

   | Part | What it lets you do |
   | --- | --- |
   | Button | Rolls |
   | Key | Drives |
   | Rocket | Pushes along its aim |
   | Lantern | Lifts when lit; unlit, it still catches draughts |
   | Spring | Kicks off whatever its foot touches |
   | Hook | Snags a shelf (or a swinging pendulum) along its aim, reels in; swing and let go |
   | Umbrella | Brakes against the air the way it faces; open in an updraft, it rides it |
   | Balloon | Pulls up all the time, for free; thumbtacks and candle flames pop it |
   | Eraser | Rubber: hits it takes don't shake the lamp, and it grips what it pushes |
   | Coin | Weight: ballast against balloons, grip for shoving |

2. **Every job asks one new physical question**, and has at least two structurally different solutions. `test/levels.test.ts` replays two or more legal bench builds per job with their timing nudged early and late, checks every star is earnable, and from job 3 on checks that the plain cart fails. From the Bookshelf on it also checks that holding Drive alone never earns all three stars, and that the last job's builds don't already solve the next one.
3. **Land on your wheels.** A hard landing taken by the wheels is forgiven; the same hit on the frame or the lamp costs flame. This makes hops and drops readable and fair.
4. **Retry is instant**, and the build is never lost: drafts are kept per job and saved on launch.
5. **Light is cosmetic.** The lamp's glow only adds light. A dim flame never hides the terrain or the goal.

## The jobs

A world opens after three deliveries in the one before. A job opens when either of the
two before it is delivered, so one stuck job never walls off the rest.

**The Desk**

| # | Job | Introduces | The question |
| --- | --- | --- | --- |
| 1 | First Light | Shirt Button | Make it roll at all (starter frame given) |
| 2 | Ruler Rise | Clockwork Key | Drive up a slope without tipping: where does the weight go? |
| 3 | The Inkwell | Match Rocket | Cross a gap too wide to drive; aim the thrust through the centre of mass |
| 4 | Top Shelf | Sky Lantern | Climb a wall; the draught up top pushes you to the window |
| 5 | Dominoes | Peg Spring | Hop obstacles; short carts hop better, and springs cost no flame |

**The Bookshelf**

| # | Job | Introduces | The question |
| --- | --- | --- | --- |
| 6 | Long Way Down | Paper Umbrella | A long fall over ink: brake it with a canopy, or unlit lanterns as parachutes |
| 7 | Swing Shift | Paperclip Hook | No run-up and too far to jump: swing from the shelf above, or burn a rocket |
| 8 | Balloon Ride | Party Balloon, Brass Coin | A wall too tall: how many balloons, how much ballast? The letter wants a slow, heavy rise |
| 9 | Last Embers | Rubber Eraser, candles | Start nearly out. Rockets cost flame, candles give it back; hook the first gap for free, rocket the second |
| 10 | Drawbridge | hinged books | Topple a heavy hinged book across the gap: leverage up high, weight for grip, or a rocket shove |

**The Mantelpiece**

| # | Job | Feature | The question |
| --- | --- | --- | --- |
| 11 | Chimney Draught | updraft | Ride the hearth's draught with an open umbrella, two for height, or an unlit lantern as a sail |
| 12 | Grandfather Clock | pendulum | Wait for the beat, hook the swinging pendulum, let go over the far side; or one hard rocket burst |
| 13 | Mantel Run | finale | Topple the drawbridge and ride the draught with one build |

## Art direction

A cut-paper diorama of a desk at midnight. Thick indigo ink keylines, bright paper parts,
a cork bench with brass pins, book-spine skyline and a paper moon. A part looks the same
in the tray, in your hand and mounted.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Lay a matchstick | drag pin to pin | drag pin to pin |
| Add a part | drag from the tray onto a stick end | same |
| Aim a rocket, spring, hook or umbrella | click it | tap it |
| Remove | click a stick; drag a part off; right-click | tap a stick; drag a part off |
| Undo / redo | Ctrl+Z / Ctrl+Y | buttons |
| Scout the level | S or Tab | SCOUT |
| Go | Enter | GO! |
| Drive / Rockets / Lanterns / Springs | Space / W / E / Q | the round pads |
| Umbrella (hold) / Hook (tap) | A / F | the round pads |
| Switch world on the job board | ← / → | the tabs |
| Rebuild / run again | R / T | buttons |

```
npm install
npm run dev        # http://localhost:5173
npm test           # bench rules, two solutions per job, determinism
npm run build
```

## Code map

- `src/sim/`: pure, deterministic, and headless. It includes:
  - `parts.ts`, the kit
  - `blueprint.ts`, the bench rules
  - `level.ts`; the jobs in `levels.ts` (Desk), `levels-shelf.ts`, `levels-mantel.ts`, gathered with the unlock rules in `all-levels.ts`
  - `run.ts`, Planck.js physics at a fixed 1/60 s tick
  - `stars.ts`
- `src/game/`: the screens. `menu.ts` is the job board, `bench.ts` the editor, `play.ts` the run plus the result card, and `game.ts` the flow and save.
- `src/render/`: the camera (`view.ts`), part art (`art.ts`), the scene (`scene.ts`) and UI helpers (`ui.ts`).
- `test/play.ts`: test helpers. They write builds tersely (`'0,0 3,0 6,0'`, `'rocket@3,0>1'`) and replay timed or closed-loop inputs.
