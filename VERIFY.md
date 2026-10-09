# Visual verification

```bash
npm run verify
```

[`scripts/verify.mjs`](scripts/verify.mjs) runs the whole check with nobody involved:

1. It starts its own Vite dev server on port 5199, so it never clashes with a server already running on 5173.
2. It opens the game in headless Chrome at 1280 × 720.
3. It drives a fixed route with the real keyboard:
   - north on avenue 0, then a left onto street z = 40;
   - **a lap** of block (1, 1), through four corners;
   - **two right turns**, onto street z = −40 and then avenue 160;
   - **one deliberate collision**, a swerve at 13 m/s into the building on the kerb at x = 164, z 15–36;
   - then **the game states**: the car is parked short of the current delivery beacon (screenshot), driven onto it (the delivery must be banked), and the clock is run out (the run must end "out of time", screenshot of the card).
4. It saves 18 screenshots to `verify-shots/`: 14 at fixed distances along the route, one at impact, one half a second after, one of the beacon and one of the game-over card. The delivery clock is topped up at the start so the route isn't cut short.
5. It writes `verify-shots/report.json` with the car and camera state at every screenshot and every half second.

The route is driven by [`scripts/verify-autopilot.js`](scripts/verify-autopilot.js), which is injected into the page. Each frame it reads the car through a dev-only hook and holds ← → ↑ ↓ the way a player would: it steers toward a point a few metres ahead on the route, slows for marked corners, and keeps full pace into the wall.

**Every run is the same run.**
- Playwright's fake clock is paused, and the script advances it in exact 16 ms frames.
- `Math.random` is seeded and re-seeded just before the run starts.
- The script waits for React to remount the scene before advancing a single frame.

Three consecutive runs produced identical positions, speeds and lives at all 16 screenshots.

**Checks on every step, not just at screenshots.** The run fails if:
- the chase camera is ever inside a building;
- the car body overlaps anything solid by more than 1 cm;
- the page logs an error or warning;
- the route isn't finished.

The one known warning that isn't ours (R3F still uses `THREE.Clock`, which three r185 deprecates) is on an explicit ignore list in the script.

Playwright was added as a dev dependency. It drives the installed Google Chrome (`channel: 'chrome'`), so no browser download was needed.

---

## What I saw, ranked by how bad it looks

First run, before any fixes. Shot numbers refer to `verify-shots/NN-*.png`.

### 1. Doors and dark windows float in front of black walls (fixed)
Seen in shots 07, 09, 10, 14, 15 and 16: about half the route.

Any wall facing away from the key light rendered as **#000001**. That's pure black, darker than the sky (#0D1117) and darker than anything in the palette. With only the ambient fill, the filmic tone curve crushes #1C2128 to nothing. The doors and dark glass on those walls are drawn unlit at exactly #0D1117, so they came out *lighter* than the wall behind them. On every shaded façade the town looked like grey rectangles floating in a void.

### 2. Roller shutters z-fight (fixed)
Seen in shots 05, 08, 11 and 12.

The slat lines on closed shutters broke into ragged dashes along their length. Each slat was a decal laid on top of the shutter panel, on the same plane with the same depth offset, so the depth test flipped between them pixel by pixel. A new check in the town test found **227 more coplanar overlaps** of the same kind: ground-floor doors placed at random overlapped each other (86) and overlapped the odd small window (141).

### 3. Lit shopfronts are solid off-white slabs (fixed)
Seen in shots 04 and 12.

A lit shop could get #E6EDF3 glass across its whole frontage. That's 3–4 m tall and many metres long at full palette white, the brightest thing on screen apart from lane markings, and it read as a flat pale block, which the town brief bans outright. Long ribbon windows could do the same higher up.

### 4. Shaded street walls merge with the sky (fixed, same cause as 1)
Seen in shots 15 and 16.

The building the car hits is a black shape you can only read by its edges. It's the same rendering cause as problem 1, and fix 1 fixed it.

### 5. Steered front wheels poke through the body sides
Seen in shots 03, 06, 12 and 16.

At full lock the front wheels of `car.glb` swing out past the 1.8 m body and show as black lumps beside the wings. It comes from the asset's wheel placement (x = ±0.77). It's accurate for a real car, but at this camera distance it reads as clipping.

### 6. Lit grey shopfronts are large flat panels
Seen in shots 02 and 09.

They're split by mullions and sit at the dim palette grey, so they read as lit glass. It's acceptable, but they're still the biggest flat areas in a street view.

### Checked and not found
- **Camera through geometry:** none. In every step of the run the camera was never inside a building, and in the 148 frames sampled into the report its height stayed at exactly 3.00 m.
- **Car clipping into buildings:** none. The worst overlap of the car body with any solid, including at the moment of impact, was 0.000 m.
- **Buildings floating or sinking:** none in the shots. The generator test also checks this: every building starts at y = 0, every one has a face on the kerb line, and none crosses the road.
- **Car at the wrong height:** none. The car sits on the road in every shot. It only leaves y = 0 for the few-centimetre shake when it's off-road or against a wall.
- **Z-fighting between road tiles, junctions, ground and lots:** none visible. The ground sits 5 cm below the tarmac, and lot paving is level with it without overlapping.

---

## Fixes for the top three

| # | Fix | Where |
|---|---|---|
| 1 | Town walls never render darker than their own palette colour. A shader term adds each surface's own colour back as a floor, so a wall in shade shows #1C2128 / #161B22 / #30363D and the key light brightens it from there. Glass and doors at #0D1117 now read as recesses. | `src/components/Town.tsx` (`SHADE_FLOOR`) |
| 2 | Shutters are separate strips with real gaps showing the wall, and nothing is drawn over anything else. Doors and small windows are placed so they never overlap. | `src/lib/town.ts` (`groundFloor`) |
| 3 | Off-white glass is limited to small openings. Shopfronts and ribbon windows that are lit use the dim palette grey. | `src/lib/town.ts` (`glass`) |

**Fix 1 caused a new problem, which is also fixed.** The first version of the floor applied to every face, including the tops of the lot paving slabs. On the next run, lots rendered visibly lighter than the road they open onto (shot 14). The floor now applies only to walls, not to surfaces facing up.

### Confirmed after the fixes (re-run)
- **Shaded walls (problem 1):** a shaded wall samples **#0D1219** against a sky of **#080C12**; before, it was #000001 against #0D1117. Doors on it sample **#0D1117**, now *darker* than the wall instead of lighter. On sunlit walls doors are #0D1117 on #2D343E. Shots 07, 14 and 16 now show slate walls with recessed doors.
- **Z-fighting (problem 2):** the town test's coplanar-overlap check is **0** across 5.7 million decal pairs in 81 blocks (227 before). Shutters in 04, 07, 08 and 12 show clean, continuous slats.
- **White slabs (problem 3):** no white slabs anywhere in the 16 shots.
- **The loop itself:** it passes with no errors.

---

## Performance

```bash
npm run perf                                   # this checkout
npm run perf -- --root <other checkout> --label original
```

[`scripts/perf.mjs`](scripts/perf.mjs) builds the checkout, serves the production build, and lets the car cruise for 12 s on the start screen. Every version of the game drives itself straight on at 16 m/s there, so the same script measures the original commit and today's build like for like. Settings: headless Chrome, 1280 × 720 at 2× pixel ratio, vsync and the frame cap off, three runs per checkout, median reported.

**Frame cost** is CPU time in the page's animation-frame callbacks *plus* waiting for the GPU to finish the frame (a 1-pixel `readPixels` forces it). Plain uncapped frame intervals turned out to be useless: Chrome overlaps GPU work with the next frame, and both versions showed about 1.8 ms whatever was on screen. Draw calls and triangles are counted on the WebGL context. Nothing in the app is hooked.

| | Frame cost | p95 | CPU | Draw calls | Triangles |
|---|---|---|---|---|---|
| Original straight road (commit `56340ac`) | 2.62–2.70 ms | 3.70 ms | 0.42–0.48 ms | 146 | 1.4k |
| Town, before the performance pass | 3.00 ms | 4.10 ms | 0.58 ms | 109 | 137k |
| Town, after | 2.71 ms | 3.70 ms | 0.35 ms | 99 | 51k |

The two original figures come from two sessions (the "before" was measured in the first, the "after" in the second). The town is now level with the original at p95 and within about 3% on the mean, inside the original's own spread between sessions, while using 17% less CPU. Both are far below a 16.7 ms frame.

What made the difference, in order of effect:
1. **Per-block culling.** Each town block in range gets its own instanced meshes, placed at the block's centre with real bounds. three.js drops whole blocks outside the view, and blocks past the fog (which would render as plain sky) aren't drawn at all. Positioned at their centres, blocks also sort front to back, so near buildings hide far ones before they're shaded. A block's data is copied in once, when it comes into range. (137k → 51k triangles.)
2. **Cheaper shading on the town.** Lambert instead of the physically based material. On near-black matte walls the two look the same (checked in the verify screenshots), and walls fill most of the frame.
3. **Ground drawn last.** The single ground plane sits under every road and building. Drawn after them, the depth test throws its hidden pixels away unshaded.
4. **Obstacles instanced.** The avenue obstacles were 45 cloned models, one draw call per part per visible obstacle. Now there's one instanced mesh per GLB part, refilled only when a row is re-dressed. Lot props are refilled only from blocks in view, and only when that set changes.

I stopped there. What's left is the cost of shading the pixels the town covers: buildings fill most of the frame where the original showed cleared sky. Cutting it further means rendering fewer pixels (a lower pixel ratio) or changing the look, and neither belongs in a pass that should leave the game looking the same.

## Final re-run: what's still wrong, and why I left it

The loop passes after every change in this pass. All 18 shots were captured, both game-state checks passed (a delivery banked 240 m and added 40 s, and running out of time ended the run "out of time"), the camera and car checks were clean on every step, and there were no console problems. Looking at the shots, worst first:

1. **Blank side walls.** Shot 10, the whole left side: where a building rises above a lower neighbour or borders a lot, its side wall has no windows and reads as a featureless slab. *Why it's left:* fixing it means working out which parts of each side wall are exposed and giving them façades. That's a generator change, and like the last one it would reshuffle every block. It's the next thing I'd do, but it's a town feature rather than a polish item, and it would invalidate the before/after comparisons this pass relies on.
2. **Steered front wheels poke through the body.** Shots 03, 10, 15 and 16. *Why it's left:* that's the Claude Design `car.glb` itself, with wheels at x = ±0.77 on a 1.8 m body, and real cars do it too. Hiding it means editing the asset or faking the steering angle, and both are worse.
3. **The impact barely registers on screen.** Shots 15 and 16: the car stops against the wall with a 4 cm shake. *Why it's left:* that's game feel (a flash, debris, a camera jolt, a time penalty), not a rendering defect. It deserves a decision from you, not a guess from me.
4. **Dark walls render darker than their palette colour.** For example #1C2128 comes out near #0E1116, because the filmic tone curve crushes the bottom of the range. A lone lit window on such a wall can read like a floating card up close (seen while checking shot 17, where a single off-white window sits on a 7 m building's ground floor). *Why it's left:* the fix is tone mapping or exposure, which is global and changes the car and road too. The earlier floor already keeps walls above the sky, which was the bad case.
5. **"Desert Route 9 · night"** is still the subtitle on the start and game-over cards (shot 18), though the desert is now a town. *Why it's left:* that's branding.
6. **Obstacles only exist on the starting avenue,** so after the first turn the only hazards are walls and lots. *Why it's left:* spreading them over the network means rows laid in street-local frames (MIGRATION.md step 7). It's gameplay scope, and nothing in the screenshots looks wrong because of it.

Also known and not visual: R3F 9 still uses `THREE.Clock`, which three r185 deprecates. It's on the loop's ignore list until R3F moves off it.

One thing to know when comparing against earlier screenshots: fixes 2 and 3 change how many random numbers each façade uses. Since every block's layout comes from one seeded sequence, the town is rearranged compared with the previous version. It's still fully deterministic, just not the same buildings as before this change.

## Limits of this loop
- It sees one route, from the chase camera, at 18 points. Problems that only show from other angles, at other junctions or mid-frame (flicker between frames) can be missed. The per-step checks cover camera and car overlap everywhere along the route, but nothing else.
- Screenshots are judged by eye (mine). Pixel samples back up the specific claims above, but there's no image diff against a stored baseline yet.
- Headless Chrome renders through Metal here. Another GPU or driver could show z-fighting this one doesn't.
