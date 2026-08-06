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

The build stops at **C6**. The difficulty ramp (C7) and the performance pass
(C8) were written but never run, so the speed is a fixed 16 m/s and no frame
numbers are claimed anywhere.

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
```

## Controls

| Key | Action |
|---|---|
| `←` `→` or `A` `D` | Steer |
| `Enter` | Start, and retry after game over |

Three lives. A hit costs one and gives a second of invulnerability with the car
flashing. Score is metres travelled.

## How it works

The car and the camera never move. The **world scrolls past them** — road
segments, scenery and obstacles all travel toward the camera and recycle to the
back of the queue once they pass behind it. That single trick is the whole
illusion, and it is why nothing here needs a physics engine.

| Path | What |
|---|---|
| `src/components/` | The 3D scene — assets, scrolling road, scenery, player car, obstacle pool |
| `src/lib/` | Pure logic: obstacle row generation, AABB collision, frame-delta clamp |
| `src/game/store.ts` | Game state — phase, lives, score |
| `src/ui/Hud.tsx` | Start screen, in-run HUD, game-over card |
| `src/design/` | Design system ported from the Claude Design handoff — tokens and primitives |
| `public/models/` | The five GLBs |

A few decisions worth knowing about, all of them Claude's:

- **Object pooling.** Every obstacle slot owns one of each of the three types up
  front; a row is "dressed" by moving slots and toggling which variant is
  visible. 45 clones, allocated once, never destroyed.
- **Guaranteed-passable rows.** Obstacle rows are rejection-sampled until at
  least 2.5 m of continuous clear road remains, so the game is never randomly
  unwinnable.
- **A forgiving hitbox.** The car's collision box is 80% of its visual size, so
  near misses read as near misses.
- **A clamped timestep.** Frames are integrated at 1/30 s maximum. Without it, a
  backgrounded tab resumes with a multi-second delta, the world jumps ~48 m in
  one step, and obstacles tunnel clean through the car.

## Known gaps

- Speed never ramps; difficulty is flat (C7 not run).
- Never profiled; geometry is not instanced (C8 not run).
- No sound, no mobile/touch input, no high-score persistence.
- Obstacles pass through the car rather than crashing into it — a hit is a flash
  and a lost life, nothing more.
- The verification done during the build (row-generation and collision checks
  over 200k samples) was run as throwaway scripts and is not committed, so there
  is nothing to `npm test` here.
