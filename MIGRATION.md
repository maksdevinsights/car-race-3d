# Migration: treadmill → driving through a town

Today the car sits at the world origin. The road, the scenery and the obstacles
scroll toward it along −Z and get recycled once they pass behind the camera. The
target is a car that really moves through a town with streets and intersections,
and a world that stays still.

Line numbers refer to commit `56340ac`.

---

## 1. Places that assume the car is stationary, the world moves, or the road is infinite and straight

### `src/App.tsx`

| Line | What it assumes |
|---|---|
| 10–12 | `CAR_X = 0`, `CAR_Z = 0`: the car's position is a compile-time constant. The comment says the camera sits on the centre line because the car only steers either side of it. |
| 14–19 | `CAMERA_POSITION` is a constant `[0, 3, -6]` worked out from that fixed car position. |
| 21–26 | `CAMERA_ROTATION` is a constant yaw of `Math.PI`, so the camera always faces world +Z. It assumes the road always runs along +Z. |
| 35–42 | The camera gets these as static props. Nothing ever updates it, and it isn't parented to the car. |
| 41 | `far={500}` is sized for a straight corridor. It's fine for a town but it's tuned to this layout. |
| 44 | The directional light is fixed at `[12, 18, 8]`. That's harmless with no shadows, but if you add shadows the shadow camera has to follow the car. |

### `src/components/Scene.tsx`

| Line | What it assumes |
|---|---|
| 12–13 | `SPEED = 16` is described as the "scroll speed of the world". In practice it's the car's forward speed, held by the world. |
| 15–21 | The header comment states the model outright: the road runs along +Z, the car holds station at z = 0, the camera never moves, and the world scrolls along −Z. |
| 23–24 | `CAMERA_Z = -6` is copied by hand from App.tsx (see §5.5). |
| 26–40 | `SEGMENT_COUNT`, `SEGMENT_SPAN`, `SEGMENT_RECYCLE_Z` and `SEGMENT_Z` are a ring buffer of 16 straight tiles in a single line at x = 0, recycled against a fixed camera z. This ring buffer is what makes the road infinite and straight. |
| 42–49 | `LONGEST_CONTACT` divides by `SPEED`. It assumes every contact closes at a constant 16 m/s along Z (see §3 and §5.2). |
| 56–59 | `speed = phase === 'over' ? 0 : SPEED`. Freezing the game means stopping the world, and the start screen keeps the world rolling. |
| 69–80 | Every road segment gets `position.z -= moved` and recycles with `+= SEGMENT_SPAN`. |
| 81–82 | `travel(moved)` scores the world's scroll distance, not anything the car does. |
| 89–99 | Segments are placed at `[0, 0, z]` with no rotation. Every tile is assumed to share one axis. |
| 101 | `<Obstacles speed={speed}>`: obstacles get the world's scroll speed. |

### `src/components/PlayerCar.tsx`

| Line | What it assumes |
|---|---|
| 8–9 | `MAX_OFFSET = 3`: the car is clamped to ±3 m from a single centre line at x = 0. |
| 17–27 | `STEER_SPEED` and `STEER_ACCELERATION` describe sideways movement only. There's no forward speed, heading or throttle. |
| 29–31 | Only left and right keys exist. Nothing handles throttle, brake or reverse. |
| 48–50 | The car's state is `offset`, `velocity` and `roll`: one lateral number. Heading and forward position aren't stored anywhere. |
| 83–85 | The steering sign is flipped because the camera faces +Z. "Right" is hard-coded as world −X, which is only true while the car points along +Z. |
| 92–96 | Lateral integration and the `MAX_OFFSET` clamp. The clamp is the only thing keeping the car on the road (see §5.3). |
| 100–101 | Roll comes from lateral velocity. With real steering it should come from yaw rate × speed. |
| 103–104 | Only `position.x` and `rotation.z` are ever written. `position.z` and `rotation.y` stay at 0 forever, and the collision code depends on that. |

### `src/components/Obstacles.tsx`

| Line | What it assumes |
|---|---|
| 21–26 | `ROW_SPACING` and `ROW_COUNT`: a fixed number of rows evenly spaced along Z. |
| 28–30 | `CAMERA_Z = -6` is another hand copy, and `RECYCLE_Z` is derived from it. |
| 41 | The `speed` prop is "matching the road". Obstacles move and the car doesn't. |
| 89–101 | Every row gets `position.z -= travel` and recycles to the front with a new random layout. Obstacles only exist ahead of a car that never passes them, so the supply is infinite. |
| 142 | Initial row positions are computed from `RECYCLE_Z`, in a single line along +Z. |

### `src/components/Roadside.tsx`

| Line | What it assumes |
|---|---|
| 9–12 | `ROAD_HALF_WIDTH = 4`, and `GROUND_OFFSET` puts one ground plane on each side of a single road at x = 0. |
| 14–20 | The ground is a **finite** strip, z ∈ [−60, 540], and never moves. That only works because the car never travels. A moving car runs off the end after about 540 m, roughly 34 s at 16 m/s. |
| 22–23 | `CAMERA_Z = -6`, a third hand copy. |
| 25–31 | `HILL_SPAN` and `HILL_RECYCLE_Z`: the hills are another z ring buffer. |
| 42–54 | The `HILLS` x positions (±28…46) are measured from the one straight road. |
| 64–74 | Every hill gets `position.z -= travel`, recycled by `HILL_SPAN`. |
| 78–83 | The ground planes sit at y = 0, butting up against the road edges at x = ±4. That placement is the only reason they don't overlap the road. |

### `src/components/RoadSegment.tsx`

| Line | What it assumes |
|---|---|
| 6–7 | It's a straight 8 × 9 m tile that runs along Z. The GLB (`public/models/road-segment.glb`) has edge lines baked in at x = ±3.72 and a centre dash. **No intersection, corner or T-junction asset exists.** |

### `src/lib/frame.ts`

| Line | What it assumes |
|---|---|
| 1–13 | The reasoning is about "the world leaping" and "obstacles tunnelling through the car". That still holds once the car moves, but the thing doing the tunnelling becomes the car. The comment's rule that "every mover must clamp identically" stops mattering once only the car moves. |

### `src/game/store.ts`

| Line | What it assumes |
|---|---|
| 7–12 | The `INVULNERABLE_SECONDS` comment says "the time an obstacle takes to pass through the car (~0.5 s at the current speed)". It assumes obstacles pass through the car at a constant speed. |
| 17–18, 26, 56–63 | Score is "metres travelled", fed every frame by the world's scroll distance. Driving in circles, reversing and sitting still all need a rule (see §4, step 8). |

### `src/ui/Hud.tsx` and `README.md`

- `Hud.tsx:62–64`, `:76`, `:128` show the "Night Highway" and "Desert Route 9" branding.
- `Hud.tsx:79`: "Steer with the arrow keys or A and D." The controls change.
- `README.md:72` (controls table), `:80–83` ("The car and the camera never move…") and `:113–114` (pass-through hits) describe the treadmill as the design.

---

## 2. Places that assume obstacles arrive on a single axis

| Location | Assumption |
|---|---|
| `Obstacles.tsx:64–81` (`dressRow`) | Each slot gets only `position.x`. Rows are on Z and slots on X, and `rotation` is never set. |
| `Obstacles.tsx:93–101` | Rows move along −Z only, and recycling is one-dimensional. |
| `Obstacles.tsx:106` | The car box is built from `car.position.x` and `car.position.z`, with no yaw. |
| `Obstacles.tsx:112–114` | The broad phase is `ahead = row.z − car.z`, a signed distance along Z only. A row at the same z but 100 m off to the side passes. A row more than about 4.3 m behind the car is skipped. |
| `Obstacles.tsx:120–125` | An obstacle's world position is put together by hand from the slot's local x and the row's z. That's only correct while row groups sit at x = 0 with no rotation. |
| `Obstacles.tsx:126–129` | The test returns at the first overlap and gives a yes/no answer. Direction doesn't matter when everything comes from the front. |
| `collision.ts:12–19` | `CAR_SIZE` and `OBSTACLE_SIZES` are fixed in world axes, with x as width and z as length. A stalled car on a cross street, or the player after a 90° turn, would have its box the wrong way round. |
| `collision.ts:37–55` (`boxAt`) | It takes `(x, z)` and has no rotation parameter. |
| `collision.ts:68–69` | `TEST_RANGE_AHEAD = 20`: "ahead" means +Z. |
| `collision.ts:71–77` | `TEST_RANGE_BEHIND` is built from **z** extents only (car length plus the longest obstacle length). |
| `obstacleRows.ts:1–2` | `ROAD_HALF_WIDTH = 4`: one road, centred on x = 0. |
| `obstacleRows.ts:4–8, 24–45` | The passability guarantee (`widestGap`) is a 1D interval sweep across X. It only guarantees a gap in the cross-section of a straight road. |
| `obstacleRows.ts:15–16` | `WIDTHS` holds widths along X only. |
| `obstacleRows.ts:22` | `Placement = { type, x }` has no z and no rotation. |
| `obstacleRows.ts:47–56, 69–70` | Random x within ±(4 − half width), and the fallback cone is pinned to a road edge at ±x. |
| `Scene.tsx:42–49` | `LONGEST_CONTACT` uses z extents divided by the Z closing speed. |
| `PlayerCar.tsx:8–9, 92–96` | Dodging only happens along X, and the car's freedom is exactly the axis perpendicular to how obstacles arrive. |

---

## 3. What the collision code does today, and what breaks

### What it does

`useFrame` runs once per frame in `Obstacles.tsx:89–132`:

1. Move every obstacle row toward the camera and recycle rows that are behind it.
2. Build one axis-aligned box for the car: 80% of 1.8 × 1.4 × 4.2 m, placed at the car's x and z, with its bottom shrunk up from the ground. It ignores the car's roll and assumes the car points along Z.
3. For each of the 5 rows: skip the row unless it's between about 4.3 m behind and 20 m ahead of the car **along Z**. That's the broad phase.
4. For each visible slot in a surviving row, build an axis-aligned box from the hard-coded size for its type, at (slot x, row z), and test six interval overlaps.
5. At the first overlap, call `onHit()` and stop testing for the frame.

`Scene.tsx:61–67` (`handleHit`) then does this: if the flash timer is still running, ignore the hit. Otherwise set the timer to `max(1 s, LONGEST_CONTACT + 0.1)` and take a life.

**Nothing pushes back.** The obstacle carries on through the car. Two hits in a row are prevented only by the invulnerability window, and that window is sized so a stalled car at 16 m/s has fully passed through the car before it ends.

The y test in `overlaps` always passes, because everything stands on y = 0. In practice it's a 2D test on the XZ plane.

### What breaks when obstacles surround the car

1. **The broad phase is directional.** It only looks along +Z, from −4.3 m to +20 m. Once the car turns down a cross street, an obstacle on its new "ahead" can sit at any z. Obstacles beside or behind the car, or at a junction it's turning into, get skipped or tested by luck. Reversing into something is never detected.
2. **Boxes don't rotate.** After a 90° turn the car's real footprint is 4.2 m along X, but its box is still 1.44 m wide in X. Nose and tail hits get missed, and the sides get phantom hits from 3.36 m out along Z. Mid-turn (45°) the error is at its worst. Cross-street obstacles such as a stalled car on an east–west street have the same problem.
3. **Obstacle positions are put together by hand** (row z + slot x). As soon as obstacles live on streets with any direction or offset, this is wrong. It has to read world positions.
4. **Pass-through only works while everything is moving.** A pass-through hit makes sense when an obstacle sweeps past at a constant 16 m/s. Against still obstacles, a car that brakes, stops or drives slowly can sit inside a stalled car indefinitely. It loses a life every `max(1, LONGEST_CONTACT + 0.1)` seconds and drives through walls. Buildings and kerbs need a **blocking** response, and that's new code.
5. **There's no contact normal.** `overlaps` returns a boolean. Pushing out, sliding along a wall or bouncing off all need the penetration depth and direction (the minimum translation vector). The current test can't produce one.
6. **The invulnerability window is tied to `SPEED`.** `LONGEST_CONTACT` assumes contact lasts as long as the closing speed allows. With a variable car speed and still obstacles, contact length is unbounded, so the "one hit per obstacle" guarantee breaks. Track hits per obstacle instead: count a hit on contact start and don't count it again until the contact ends.
7. **Pooling and recycling are the spatial index.** "Which obstacles could be near the car" is currently answered by "the 5 rows in the ring buffer, filtered on Z". In a town obstacles stay where they are, so you need a real spatial index. A uniform grid or a per-street bucket is enough.
8. **The passability guarantee is local to one row.** `widestGap` guarantees 2.5 m of clear space across an 8 m straight road. It says nothing about junctions, turning paths through an intersection, or whether a whole route is reachable. Placing rows in street-local coordinates keeps the per-row guarantee, but intersections have to be kept clear explicitly.
9. **Tunnelling margin.** At 16 m/s with the 1/30 s clamp, the car moves 0.53 m per step. The thinnest contact is a cone hit from the side: 0.5 m plus 1.44 m of car width, which is well clear. If you build the C7 speed doubling (1.07 m/step), it still clears, but thin building walls built in code need to stay at least as thick as one step.

---

## 4. Order of changes, and what's testable after each

The principle: **flip the treadmill while the road is still straight.** Then any
behaviour difference is a bug in the flip and not a town feature. Rotation and
the town come only after that.

### Step 0. Put a test harness under the pure logic
Add Vitest (dev dependency only). Port the "row-generation and collision checks over 200k samples" that the README mentions (`README.md:115–117`) were never committed. Cover `widestGap`/`generateRow` and `boxAt`/`overlaps`.
**Testable:** `npm test` passes against today's code. Without this, steps 4–7 rewrite `collision.ts` with nothing to catch regressions.

### Step 1. Remove duplicated constants and make frame order explicit (no behaviour change)
- Make `CAMERA_Z` (Scene.tsx:24, Obstacles.tsx:29, Roadside.tsx:23), `ROAD_HALF_WIDTH` (Roadside.tsx:10, obstacleRows.ts:2) and `WIDTHS` vs `OBSTACLE_SIZES[].x` (obstacleRows.ts:16, collision.ts:15–19) single sources.
- Replace the four independent `useFrame` callbacks with one simulation tick in `Scene` that runs, in order: input → car integration → (world scroll, while it still exists) → collision → flash. See §5.1 for why.
**Testable:** the game plays identically, and step 0's tests still pass.

### Step 2. Chase camera that follows a target transform
Replace the static `PerspectiveCamera` props (App.tsx:19–26, 35–42) with a camera that reads the car's position and heading every frame and sits 6 m behind and 3 m above it in the car's local frame. For now, follow z and heading only, not the lateral offset, so the view doesn't change.
**Testable:** the game looks exactly the same. This is verified by eye, but it's quick to check.

### Step 3. Flip the treadmill on the straight road
- The car moves +Z at `SPEED`, and `PlayerCar` writes `position.z`.
- Road segments, hills and obstacle rows stop moving. Recycle them against **the car's z** instead of a fixed camera z (Scene.tsx:69–80, Obstacles.tsx:93–101, Roadside.tsx:64–74).
- Make the ground follow the car's z or tile it, because the finite strip ends at 540 m (Roadside.tsx:14–20).
- Score comes from the car's displacement, not from `moved` (Scene.tsx:82).
- `phase === 'over'` stops the car instead of the world. Decide what the start screen does (§5.8).
**Testable:** it should play the same as before. Score after N seconds matches. Collision works unchanged because it already uses world x and z. Run past 540 m to confirm the ground keeps going. This is the main step that removes risk.

### Step 4. Heading-based car model
Replace `offset` and `velocity` (PlayerCar.tsx:48–50, 75–104) with position, heading (`rotation.y`) and forward speed, plus throttle and brake input (add Up/Down and W/S). Steering becomes yaw rate, and roll comes from lateral acceleration. Remove the camera-dependent sign flip (PlayerCar.tsx:83–85). **Temporarily cap the heading at about ±25°** and keep a soft clamp to the road edges, because collision can't handle rotation yet.
**Testable:** drive along the straight road, steer with a visible yaw, accelerate and brake. Hits still register on head-on approaches.

### Step 5. Rewrite collision for rotated, surrounding, solid obstacles
In `collision.ts`:
- Use oriented 2D boxes on XZ (SAT with two axes per box), built from position, yaw and size. Drop the y test or keep it as a cheap first reject.
- Return a penetration vector (MTV), not a boolean.
- Use a radial broad phase from a uniform grid around the car, not Z ranges (replace `TEST_RANGE_AHEAD`/`BEHIND`).
- Split obstacles into kinds. **Hazard** obstacles (cones, barriers, stalled cars) cost a life once per contact. **Solid** obstacles (buildings, and stalled cars too if you want) push the car out along the MTV and kill its speed along the normal.
- Replace `LONGEST_CONTACT` (Scene.tsx:42–49) and the `INVULNERABLE_SECONDS` rationale (store.ts:7–12) with per-obstacle contact tracking. The flash can stay as purely visual feedback.

Then lift the ±25° heading cap.
**Testable:** unit tests for OBB overlap at 0°, 45° and 90°, hits from all four sides, the MTV pointing out of the obstacle, and a still car inside a hazard losing exactly one life. In the game, U-turn on the straight road and reverse into an obstacle. Both should register.

### Step 6. Town data model and rendering, with no obstacles yet
- Write a pure module that describes the town as a graph of intersections and streets with grid positions and directions. Street lengths are multiples of `SEGMENT_LENGTH` (9 m). Intersections are 8 × 8 m.
- Render street tiles rotated along their street, plus an **intersection tile, which doesn't exist yet**: build it in code as a plain asphalt quad, or get one from Claude Design (§5.6).
- Add one ground plane under the whole town, slightly below the road (§5.7). Add buildings as blocks between streets and register them as **solid** in the step 5 grid.
- Retire `Roadside.tsx`, or move the hills outside the town boundary.
**Testable:** unit tests that every street connects two intersections, no tiles overlap, and the graph is connected. In the game, drive freely around the town with no obstacles. Buildings block the car and no road tiles flicker.

### Step 7. Put obstacles on streets
Generate rows in **street-local** coordinates, so `generateRow` and `widestGap` work unchanged in a local frame. Convert them to world position and yaw with the street's transform. Keep a clear zone around every intersection. Insert obstacles into the step 5 spatial grid.

A bounded town doesn't need the ring-buffer pool. Either mount everything once, which is fine up to a few hundred obstacles, or pool by distance from the car. Delete the treadmill recycling in `Obstacles.tsx`.
**Testable:** unit tests that every placed row leaves 2.5 m in its street's local cross-section and that no obstacle falls inside an intersection's clear zone. In the game, hits work from every direction.

### Step 8. Game rules
Define these rules:
- Score: distance driven, or checkpoints or deliveries.
- What happens at the town edge.
- What the start screen shows.
- Whether `key={run}` (App.tsx:46) regenerates the town or reuses a seed.

Update the HUD copy (Hud.tsx:62–79, 128) and the README.
**Testable:** a full run from the start screen to game over and retry.

### Step 9. Performance
The town makes draw calls the real constraint (§5.9). Instance or merge road tiles and buildings. This is the C8 pass that was never run.
**Testable:** measure draw calls with `renderer.info.render.calls` before and after.

---

## 5. Load-bearing things you may not have noticed

### 5.1 Collision checks last frame's car position
Each component registers its own `useFrame`, and R3F runs them in subscription order. Subscription happens in layout effects (children before parents, siblings in order), so the order today is Roadside → Obstacles → PlayerCar → Scene. **Obstacles tests collision before PlayerCar has moved the car for the frame.** Today that's harmless, because the car only moves sideways at up to 6 m/s and the important motion is the obstacles', which happens before the test. Once the car carries the motion, collision runs one step behind it, and a push-out response would be applied before the movement it should correct. That's why step 1 puts everything into one ordered tick.

### 5.2 The no-double-hit guarantee is arithmetic about a constant speed
The only thing stopping one stalled car from costing three lives is `flash = max(1, (3.36 + 4.2) / 16 + 0.1)` (Scene.tsx:48–49, 65). It depends on the obstacle passing through the car at exactly `SPEED`. Once the car can slow down, that guarantee is gone. The comment at `store.ts:7–12` says so in prose, but nothing enforces it.

### 5.3 The road edge is a clamp, not a wall
Nothing in the codebase collides with static geometry. "The car can't leave the road" is `Math.sign(offset) * MAX_OFFSET` (PlayerCar.tsx:93–96). A town needs real static collision for buildings and kerbs, so solid-body response is new work, not a change to existing code.

### 5.4 The steering sign depends on the camera
`direction = left − right` (PlayerCar.tsx:85) only means "right on screen" because the camera is yawed π and faces +Z. In a moving, turning car, "right" has to be relative to the car's heading. Otherwise the controls invert the first time you drive along −Z.

### 5.5 Three hand-synced copies of the camera z
`CAMERA_Z = -6` lives in Scene.tsx:24, Obstacles.tsx:29 and Roadside.tsx:23. Each has a "matches App.tsx" comment, while App.tsx itself derives the value from `CAR_Z - BACK`. All three recycle thresholds depend on it. If you change the camera in App.tsx alone, things pop in front of the lens.

### 5.6 No intersection asset exists
`road-segment.glb` is straight only, with edge lines (x = ±3.72) and a centre dash baked into the mesh. Crossing two tiles at a junction z-fights (both surfaces are at y = 0, the dash at y = 0.01) and draws lines through the junction. You need a new junction tile: 8 × 8 m asphalt with no markings, at minimum.

### 5.7 The ground only avoids the road because of where it's placed
The ground planes sit at y = 0, the same height as the road surface, and only avoid z-fighting because they start exactly at x = ±4 (Roadside.tsx:12, 78–83). A single ground plane under a town grid will flicker against every road tile unless it's dropped a few millimetres or cut out.

### 5.8 The start screen depends on the treadmill
"The world keeps rolling behind the start screen" (Scene.tsx:57–59) is an attract mode that comes free with the scrolling world, while steering is disabled (`steerable={phase === 'playing'}`, Scene.tsx:103). Once the car does the moving, a car that drives itself with no steering on the start screen goes straight into the first building. You'll need an autopilot, an orbiting camera, or a parked car.

### 5.9 The ring buffers are also the streaming and culling system
At any moment only 16 road tiles, 5 obstacle rows and 10 hills exist. That's why draw calls have never mattered (C8 never ran). Each road tile `Clone` is 4 meshes, a barrier is 10 and a stalled car is 14. Hidden variants cost nothing because they're invisible, but a modest town of 10 × 10 blocks with about 5 tiles per block edge is roughly 1,000 tiles × 4 = about 4,000 draw calls before buildings. Frustum culling helps less with a low chase camera in a grid. Plan for instancing or merged geometry once the town exists.

### 5.10 Passability depends on unstated timing
Rows guarantee a 2.5 m gap *within* a row, but whether you can get from one row's gap to the next depends on `ROW_SPACING` (25 m), `SPEED` (16 m/s) and `STEER_SPEED`/`STEER_ACCELERATION` (6 m/s, 24 m/s²). That's about 1.56 s between rows against about 1.25 s to cross the full 6 m. Nothing checks it. With a throttle in the player's hands it stops mattering on straights, but anything that ramps speed (C7) can quietly make the game impossible.

### 5.11 The remount is the reset mechanism
`<Scene key={run} />` (App.tsx:46) throws away and rebuilds the whole scene on every run. That works for 16 tiles. If the town is generated inside `Scene`, it's rebuilt and re-randomised on every retry. Decide whether that's intended, and pass a seed if not.

### 5.12 Obstacle meshes all face +Z
Slots never set `rotation` (Obstacles.tsx:75). The stalled car GLB faces +Z like the player car (its `car_nose` node is at z = +1.55). Rotating an obstacle to sit along a cross street means rotating its collision box too, which step 5 has to support.
