# Night Highway

A low-poly endless driving game. Dodge the traffic, keep three lives, watch the
metres climb.

Built live for a YouTube demo — **every line of this repo was written by Claude,
and none of it was edited by hand afterwards.**

---

## Read this first

This is a demo, not a product.

- **No human wrote or edited any code here.** Every file was produced by Claude
  Code in a single session, in response to the prompts in
  [`PROMPTS/`](PROMPTS/). Nothing was tidied up, refactored or corrected by hand
  afterwards — including the parts I would have written differently.
- **It is not production software.** No test suite ships in this repo, there is
  no sound, no touch or mobile support, no persistence, no error boundaries, no
  accessibility pass, and the frame rate has never been profiled. Difficulty is
  fixed.

## How it was built

Two tools, in sequence, with five files passing between them:

```
Claude Design  ──►  car.glb, traffic-cone.glb, road-barrier.glb,  ──►  Claude Code
(D1 … D5)           stalled-car.glb, road-segment.glb                  (C0 … C6)

look, models,                                                          behaviour
HUD, exporters                                                         this repo
```

Claude Design produced the design system, the 3D scene and the exporters, then
each object was downloaded on its own. Exporting one fused scene instead would
have made the game impossible — you cannot spawn a cone forty times if the cone
is welded to the road.

Claude Code got the five GLBs and a stated size for each, and never inspected
the meshes at runtime.

Every prompt, one per file: **[`PROMPTS/`](PROMPTS/)**

The first build stopped at **C6**. The difficulty ramp (C7) and the
performance pass (C8) were written but never run.

A second iteration, **T0 … T7**, also in Claude Code, broke the treadmill: the
car drives through a town in world space. T0 is the migration plan
([`MIGRATION.md`](MIGRATION.md)), T1–T5 build it (world-space car, steering,
town, collision), T6 sets up the screenshot verification loop
([`VERIFY.md`](VERIFY.md)), and T7 is the final pass: performance against the
original road, delivery scoring, and a last verification run. Where Claude
Code stopped to ask something (T2, T3), the file notes what happened.

## Running it

Needs **Node 22** — `.nvmrc` is included. Node 21 will not build: the bundler's
native binding is skipped at install time by an engine check.

```bash
nvm use
npm install
npm run dev
```

Then open the printed localhost URL.

```bash
npm run build    # tsc -b && vite build
npm run lint     # oxlint
npm run verify   # scripted drive through the town, screenshots in verify-shots/ (see VERIFY.md)
npm run perf     # frame cost of a production build; --root <checkout> to measure another
```

`/debug` shows the same run from above: the car's trail, the chase camera, and
the colliders being tested each frame.

## Controls

| Key | Action |
|---|---|
| `←` `→` or `A` `D` | Steer |
| `↑` `↓` or `W` `S` | Accelerate, brake (hold to reverse) |
| `Enter` | Start, and retry after game over |

## Playing

Drive to the beacon — the white column over a junction — before the clock runs
out. Each delivery banks the leg's distance along the street grid and adds time
for the next leg, two to four blocks away. The run ends when the clock reaches
zero or the last of three lives is lost to an obstacle.

Score is **metres delivered**, not metres driven: circling a block or getting
lost costs time and earns nothing. Walls do not cost lives — they cost speed,
and so time.

## How it works

The car drives through an endless street grid in world space; the camera trails
it. Nothing is a physics engine.

| Path | What |
|---|---|
| `src/lib/roadNetwork.ts` | The grid: where tarmac is. Everything else asks it |
| `src/lib/town.ts` | Every block's buildings, windows, lots and props, generated from the block's own seed |
| `src/lib/carModel.ts` | Bicycle steering with a grip limit, off-road drag, wall contact |
| `src/lib/colliders.ts`, `collision.ts` | Spatial hash on the road grid; turned-box narrow phase |
| `src/lib/route.ts` | Deliveries: picking legs, scoring them, the time allowance |
| `src/components/` | The scene: road and town (instanced, culled per block), car, chase camera, obstacles, beacon |
| `src/game/store.ts` | Game state — phase, lives, score, clock |
| `src/ui/Hud.tsx` | Start screen, in-run HUD, game-over card |
| `scripts/` | The verification and performance loops |
| `MIGRATION.md` | How the corridor became a town, and in what order |

## Known gaps

- No sound, no mobile/touch input, no high-score persistence.
- Obstacles only stand on the avenue the car starts on.
- Side walls exposed above a lower neighbour have no windows (see VERIFY.md).
- The 200k-sample checks run during the build are still throwaway scripts;
  `npm run verify` is the only committed check.
