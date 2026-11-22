# WICKSHIFT: Deliveries

A moth postal clerk drives a matchbox cart across a midnight desk with a lamp on the back.
**The flame is your combo.** Tricks make it bigger. Post it into a window to bank the score.
Skip a window and the flame keeps growing, but a big flame blows out on a hard landing.

## Why this version exists

Playtest feedback on the first Night Run build: the core idea was right, but it felt repetitive,
simple, and unexciting, and the shop choices were weak. In the code that showed up as:

- **Every course piece asked the same question.** Hold gas, jump, flip, land. There was nothing to avoid, aim for, or choose between.
- **Stamps were invisible.** They were flat conditional multipliers that never combined and never visibly fired.
- **The shop gave about one purchase per shift.** Wages of 4–12 against prices of 4–7 left little to decide.
- **No danger, speed, or payoff moment.** The POST prompt already showed the exact value, so the tally revealed nothing.

## Design principles

1. **Every course element must ask a different question.** Time it, avoid it, aim for it, hold it, or choose a route. If it is just "another jump", it does not go in.
2. **Courses have an arc.** Warm-up, then rising connectors and a setpiece, then a window to breathe (rest before intensity). Each delivery builds to a finale setpiece. This is intensity-and-rest pacing, as in Schell's interest curve.
3. **Builds, not bonuses.** Stamps hook into shared resources (sparks, heat, windows, landings, pennies, hoops, grinds). Some scale over the run, and order matters. You should be able to say "I'm running a grind build".
4. **Show the machine working.** Stamps shake when they fire. At a post, the tally runs base × sparks and then each stamp left to right, with the pitch rising. Big posts catch fire. Layered feedback: motion, number, sound, shake.
5. **Information that lets you plan, plus surprise in the payoff.** The window types ahead and the next Inspector are visible. The POST prompt shows only heat × sparks; stamps reveal the rest in the tally.
6. **Money is a decision.** Interest rewards saving; rerolls, postcards, parts and stamps compete for it.
7. **Three inputs only** (gas, brake, post), so touch stays first-class. Depth comes from courses and builds.

## Controls

| Action | Keyboard | Mouse | Touch |
| --- | --- | --- | --- |
| Drive / in the air: flip back | → or D (also ↑ / W) | hold left button | right pad |
| Brake, reverse / in the air: flip forward | ← or A | hold right button | left pad |
| Post the flame at a window | Space, ↓ or S | | POST pad |
| Pause | Esc or P | pause tab | pause tab |
| Mute | M | pause menu | pause menu |

```
npm install
npm run dev        # http://localhost:5173
npm test           # course, rules, stamp and economy tests (a headless bot drives)
npm run build      # typecheck + static build in dist/
```

## The night

A night is **4 routes × 3 deliveries**: Local, Express and Inspection. Clear all 12 to see the dawn, then keep
driving in **Overtime** for score. Each route is its own room of the house, with its own palette and set dressing:

| Route | Room | Look |
| --- | --- | --- |
| 1 | The Writing Desk | kraft and cream paper, rulers, inkpots |
| 2 | The Sorting Room | green baize, brass, pigeonholes |
| 3 | The Map Table | blue map paper with contour lines, compass, pins |
| 4 | The Attic | dusty violet, moonbeams, candles |

A **route card** opens each route. It shows the three targets, the pay, and the Inspector rule waiting at the end,
so you can shop for it.

### Targets

Each delivery's target is its base times the route's multiplier, rounded to two significant figures.

| Route | Local | Express | Inspection |
| --- | --- | --- | --- |
| 1 (×1) | 1,500 | 2,400 | 3,600 |
| 2 (×2.8) | 4,200 | 6,700 | 10,000 |
| 3 (×7) | 11,000 | 17,000 | 25,000 |
| 4 (×17) | 26,000 | 41,000 | 61,000 |
| Overtime | ×2.6 per extra route | | |

Route 1 is meant to be cleared with nothing bought. From route 2 on, the targets outgrow raw driving,
so the album has to carry you.

### Inspectors (one per route, the boss delivery)

| Inspector | Rule |
| --- | --- |
| The Cat | A paw swats down ahead of you. Its shadow looms and darkens first. A hit knocks the cart back and puts out the flame, but costs no glass. |
| Draught | A headwind blows down the desk. |
| Wet Ink | Slippery desk: the wheels grip less. |
| Lights Out | Pitch dark. Your lamp lights the way, so a bigger flame lets you see further. |
| Short Wick | Half the windows are boarded up. |
| Heavy Sack | The cart is heavier: lower jumps, slower spins. |
| Cold Snap | Unposted heat cools by 7% a second. |
| Tack Storm | Thumbtacks everywhere. |

The two harshest, The Cat and Short Wick, never appear on route 1, so the first Inspection teaches rather than ends the run.

## Driving a delivery

### Course elements, and the question each one asks

| Element | Question |
| --- | --- |
| Ruler kickers, gaps, drops | How many flips can I fit in, and can I land them? |
| **Striker strip** (the matchbox sandpaper) | Hit it with the gas held: a speed boost and a *Strike*. Speed feeds the big gap after it. |
| **Mousetrap** | Snaps you very high. How greedy will you be with the spins? |
| **Pencil rail** | An elevated route. Land on it to *Grind*. It usually leads over a hazard or to a high window. |
| **Thumbtacks** | Avoid them: jump or take the rail. A wheel on a tack blows out your flame. |
| **Sugar-cube stacks** | Plough through at speed to *Smash* (Bad Piggies-style physics chaos). |
| **Fire hoops** | Aim your arc so the lamp threads the hoop. Hoops always add a spark. |
| Letters | Breadcrumbs along good lines. Small heat. |

### Tricks

| Family | Tricks | Heat | Sparks |
| --- | --- | --- | --- |
| Flip | Backflip / Frontflip, ×2, ×3… | 200 · n^1.6 | first of each name in a flame |
| Air | Air, Big Air, Huge Air | 70 per second | Big and Huge, first time |
| Wheelie | Wheelie, Nose Wheelie | about 80 per second | first time |
| Landing | Clean 40, **Daredevil** 150 (a landing at 75–100% of what the lamp survives) | | Daredevil, first time |
| Grind | Grind | 110 per second | first time |
| Smash | Smash ×N | 30 per cube | first time |
| Hoop | Hoop | 200 | **always** +1 |
| Strike | Strike | 80, plus a boost | first time |

Repeating a trick in the same flame pays 0.6× each time (minimum 0.25×). Variety builds sparks.

**Postcards** level a family up. Each level adds +50% heat, and +1 to the sparks that family grants.

### Windows

| Window | Effect |
| --- | --- |
| House | ×1 |
| Express (a hanging high window, reached in the air or from a rail) | ×2 |
| Gold postbox | ×1, and pays pennies: 1 per 3 sparks, up to 4 |
| Sorting office (finish) | auto-posts whatever you are carrying |

The course strip under the meter shows the window types ahead, so you can plan which ones to skip.

### Risk

- **Fragility** grows with the value you are carrying compared with the delivery target. At 60% of the target, the flame is at full fragility.
- **Blowout:** a landing harder than the lamp tolerates loses the flame, but you keep driving.
- **Crash:** the lamp or moth hits the desk, or you fall into a drawer. You lose a glass and respawn at the last ground window. Three glasses per delivery. Breaking the last one ends the delivery, but if you have already met the target it still counts as delivered.

## Scoring a post

`(heat × sparks) × window`, then every stamp fires in album order, left to right:

- +heat stamps
- +sparks stamps
- ×sparks stamps

So order matters: a Wax Seal before an Air Mail is worth more than after it.

The POST prompt only shows `heat × sparks` (×2 at a high window). The rest is revealed in the tally, which plays under the meter:

1. The ember flies from the lamp to the window and the bell rings.
2. `heat × sparks` appears.
3. Each stamp that fires shakes in the HUD album, and its step plays with a rising pitch. Steps speed up as they go.
4. The total slams down. A post worth at least half the target is a **SCORCHER**, which gets a held beat, a flame burst and its own sting.
5. The total flies into the postage meter, which bumps.

## The Night Counter (shop)

**Offers each visit:** 2 stamps, 1 postcard and 1 cart part. Reroll costs 3, then +1 per reroll.

**Stamp prices by rarity:** common 4, uncommon 6, rare 8. Selling refunds half.

**Album:** 5 stamps. Click an owned stamp to move it left or right, or sell it.

**Wages per delivery:**

- Local 3, Express 4, Inspection 6
- +1 per 25% over the target (max 3)
- +1 for a clean delivery with no broken glass
- **Interest:** +1 per 5 pennies held (max +5)
- Stamp income

### Stamps (32)

The full table lives in `src/sim/stamps.ts`. Rarity sets the price and how often a stamp appears. The families are:

- **Trick builds:** Loop Stamp, Grease, Crumbs, Hoopla, Kite String, Tailwind, Red Letter, Backhand, Daredevil.
- **Post shaping:** Wax Seal (+sparks), Big Envelope (+heat), Pigeonhole, Double Wick, Air Mail, Express Seal, Assorted, Purist, Last Post.
- **Scaling over the run:** Collector, Bonfire, Night Owl.
- **Risk:** Hot Potato, Midnight Oil, Postage Due.
- **Safety:** Second Wind, Tempered Glass, Paper Lantern.
- **Economy:** Penny Black, Ember Purse, Moonlighter.
- **Rule benders:** Sorter's Eye, Carbon Copy (copies the stamp to its right).

### Cart parts (one per slot)

| Part | Effect |
| --- | --- |
| Cotton Reels | Big, soft wheels |
| Shirt Buttons | Small wheels, faster flips |
| Bottle Caps | More grip |
| Bedspring | Softer, well-damped suspension: survives harder landings |
| Hairpin Spring | Stiff and poppy |
| Twin Key | More power and top speed, but you land harder |
| Tail Feather | Faster air spin |
| Hurricane Glass | +1 lamp glass |

## Feel

- **Slow motion on a big post.** Posting in the air, or for 30% of the target or more, drops the sim to a third of normal speed for a moment.
- **Hit-stop.** A short freeze and a screen kick on big tricks.
- **Adaptive music.** The tempo and the number of voices follow how fragile the flame is: hats get busier above about 35%, and a second voice joins above about 55%. Inspection deliveries switch to a minor key with a kick drum. A blowout lets it all fall back.
- **Camera.** Zooms out with height and speed. Speed lines while boosted, gold on a striker strip. On a phone in portrait it pulls back and keeps the cart nearer the centre.
- **Readout over the cart.** It shows `heat × sparks`, coloured by fragility, with FRAGILE! above 75%.
- **Lights Out** turns the flame into your headlight. Lit windows glow in the dark.

## Teaching (signposting)

- **Signposts.** The first time you meet each element (striker, mousetrap, rail, tacks, cubes, hoop, high window, gold postbox), a small sign hangs over it saying what to do. The sign retires once you have used it, and the save remembers this across nights.
- **One new thing at a time.** Route 1's Local and Express courses are scripted, and each section brings in a new setpiece. Local opens on a hoop gap.
- **Hints at the moment they matter:** how to drive, how to flip in the air, POST at the first window, the first skipped window, and the first blowout.
- **Run summaries.** The game-over and dawn cards show the album you built next to the night's numbers.

## Code map

| Path | What's there |
| --- | --- |
| `src/sim/` | Headless and deterministic: `terrain.ts` (paced chunk generator, features, themes), `sim.ts` (Planck cart physics, rails, stacks, traps, paw), `tricks.ts` (families, levels), `stamps.ts` (stamp table and hooks), `rules.ts` (flame, parts, post scoring), `shift.ts` (one delivery), `night.ts` (routes, wages, shop), `bot.ts` (test driver). |
| `src/render/` | Canvas art: themes, cut-paper cart and moth, terrain, course features, UI pieces. |
| `src/game/` | `game.ts` (loop and events), `hud.ts`, `shop.ts`, `screens.ts`, `input.ts`, `fx.ts`, `save.ts`. |
| `src/audio/sfx.ts` | Synthesized sound and adaptive music. There are no audio assets. |
| `test/` | `courses` (determinism, every delivery and Inspector finishes for the bot, variety, pacing), `respawn` (every ground window is a safe respawn), `rules` (the flame and post order), `stamps` (one check per stamp, plus a check that all 32 are covered), `night` (targets, wages, interest, the shop, and bot nights with and without shopping). `nights.explore` is an opt-in calibration run: `EXPLORE=1 npx vitest run nights.explore`. |

## Dev hooks

In dev, or with `?dev`, `window.__ws` is the game:

- `__ws.auto = true` lets the bot drive.
- `__ws.devRun(seconds)` steps frames synchronously, which is useful when the tab is throttled.

## Status

All of this is tuned against a headless bot, not people. **No human has played this version yet.**

What the bot shows:

- With nothing bought, it drives every course on every route to the finish with at most one crash, and it does the same with each cart part fitted. Finishing is not the same as reaching the target.
- Flipping as it goes, it clears the first Local delivery on at least 7 seeds out of 8 with nothing bought.
- Over 36 bot nights, never shopping reached dawn 0 times; the median night ended after 5 deliveries.
- Buying everything it could afford beat not shopping on 27 seeds, tied 8 and lost 1, reached dawn 9 times, and the median night lasted 9 deliveries.
- Buying selectively (scoring stamps, postcards, Bedspring and spare glass; no risk stamps) beat not shopping on 30 seeds, tied 5 and lost 1, and reached dawn 12 times. Choosing beats buying everything.
- One stamp at a time on the same courses: scoring stamps raise posted value without adding blowouts. Twin Key adds blowouts, a speed trade-off its card now states.

Fixes this pass turned up:

- **Bedspring** was sold for safe landings but made flip landings crash about 5× more often. A soft spring sagged far enough on a tail-first landing for the lamp to touch the desk. It is now 3.8 Hz with 0.8 damping. It halves blowouts and crashes no more than the stock cart.
- **A met target is now safe.** Breaking your last glass after reaching the target still counts as a delivery.

The bot is a steady driver and a naive shopper, so route 1 is probably easier for it than for a new player. Later routes are probably harder for it than for someone who builds on purpose.

## References

- LocalThunk, ["Solitaire"](https://localthunk.com/blog/solitaire): design for a feeling and a session; use the meta-game to steer players into parts of the design they would otherwise miss.
- Game Developer, [Balatro signposting](https://www.gamedeveloper.com/design/balatro-creator-unveils-a-few-slick-signposting-strategies): teach mechanics through items at the moment they matter.
- GMTK, ["Balatro's 'Cursed' Design Problem"](https://gmtk.substack.com/p/balatros-cursed-design-problem): hidden score as a deliberate "cross your fingers" moment.
- Intensity and pacing: [Trinity: Intensity Ramps](https://www.gamedeveloper.com/design/trinity-part-6-intensity-ramps), [Examining Game Pace](https://www.gamedeveloper.com/design/examining-game-pace-how-single-player-levels-tick).
- Juice and game feel: [Pichlmair & Johansen, Designing Game Feel](https://arxiv.org/abs/2011.09201).
