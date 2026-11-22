# WICKSHIFT: Night Run

A moth postal clerk drives a matchbox cart across a midnight desk with a lamp on the back.
**The flame is your combo.** Tricks make it bigger. Post it into a dark window to bank the score.
Skip a window and the flame keeps growing, but a big flame blows out on a hard landing.

## Play

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
npm test           # course + rules tests (headless bot drives every shift)
npm run build      # typecheck + static build in dist/
```

## The loop

1. **Drive a shift.** A shift is a 25–50 s course stitched from desk pieces: ruler kickers, drawer gaps, book stairs, blotter drops, envelope whoops and hills.
2. **Grow the flame.** Each trick adds **heat**:
   - Air (by the second)
   - Backflips and frontflips (doubles and triples score much more)
   - Wheelies and nose wheelies
   - Clean landings
   - Letters picked up along the way

   The first time you land a trick type in a flame it also adds a **spark**. Repeating a trick type in the same flame pays less each time, so variety builds sparks.
3. **Post it.** In range of a dark window, press Post. The ember flies in, the window lights, and the tally counts heat once per spark (heat × sparks). Then the stamp multipliers apply and the total flies up into the postage meter.
   - **High windows** hang over jumps. They are worth ×2 but you have to be up there.
4. **Or don't.** Driving past a window keeps the flame for a bigger post later. A bigger flame is more fragile, though: landings that a small flame survives blow a big one out, and you lose everything unposted. The number over the cart turns orange, then red, as the flame gets fragile.
5. **Crashing** (lamp or moth hits the desk, or you fall into a drawer) breaks a lamp glass. You respawn at the last window. Lose all three glasses and the night is over.
6. **Make the target.** The sorting office at the end of each shift auto-posts whatever flame you are still carrying. Post less than the shift target and the night ends.
7. **The Night Counter** opens between shifts. Spend pennies on **Stamps** (rules that change how you play) and **cart parts** (physical upgrades you can see on the cart).
8. **Supervisors.** Shifts 3 and 6 each have a supervisor rule: Draught, Wet Ink or Short Wick.
9. **Dawn.** Clear all six shifts. The run shows your best single post and your night total.

## Stamps (max 5)

Each stamp changes a decision rather than adding a flat bonus:

| Stamp | Effect |
| --- | --- |
| Backhand | Backflips ×3 heat. A frontflip snuffs every spark. |
| Postage Due | Skipping a window adds +2 sparks. Rewards greed. |
| Air Mail | Posting while airborne is ×2. |
| First Class | High windows pay ×4 instead of ×2. |
| Double Wick | Posting with 8+ sparks pays ×2. |
| Hot Potato | Unposted heat grows 6%/s, but fragility rises twice as fast. |
| Tempered Glass | A big flame is never fragile, but sparks cap at 6. |
| Long Fuse | Wheelies ×3 heat and always add a spark. |
| Featherweight | Airtime ×3, clean landings worth nothing. |
| Sorter's Eye | Repeating a trick never loses value. |
| Rubber Stamp | Every clean landing adds a spark. |
| Night Owl | Each window lit this shift adds a starting spark to every new flame. |
| Bellows | Every 3 letters adds a spark. |
| Paper Lantern | Crashing keeps half your heat. |
| Ember Purse | +1 penny per window posted. |

## Cart parts (one per slot)

| Part | Effect |
| --- | --- |
| Cotton Reels | Big, soft wheels |
| Shirt Buttons | Small wheels; faster flips |
| Bottle Caps | More grip |
| Bedspring | Soft suspension; survives harder landings |
| Hairpin Spring | Stiff and poppy |
| Twin Key | More power |
| Tail Feather | Faster air spin |
| Hurricane Glass | +1 lamp glass |

## Code map

| Path | What's there |
| --- | --- |
| `src/sim/` | Headless and deterministic: `terrain.ts` (seeded chunk generator), `sim.ts` (Planck cart physics), `rules.ts` (flame, stamps, parts), `shift.ts` (tricks, windows, posting, crashes), `bot.ts` (the test driver, also `__ws.auto` in dev). |
| `src/render/` | Canvas art: cut-paper palette, cart and moth, desk terrain, UI pieces. |
| `src/game/` | Loop, input, effects, HUD, shop and screens. |
| `src/audio/sfx.ts` | Every sound and the music loop are synthesized. There are no audio assets. |
| `test/` | The bot drives every shift on many seeds. Plus flame/stamp rules and replay determinism. |

## Dev hooks

In dev, or with `?dev`, `window.__ws` is the game:

- `__ws.auto = true` lets the bot drive.
- `__ws.devRun(seconds)` steps frames synchronously, which is useful when the tab is throttled.
