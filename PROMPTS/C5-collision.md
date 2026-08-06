# C5 · Collision — the hard one

**Claude Code**

```
Add collision detection between the car and the obstacles.

Use axis-aligned bounding box overlap checks each frame, tested only against
obstacles within 20 metres ahead of the car. Do not add a physics engine.
No Rapier, no Cannon, no rigid bodies.

Real dimensions, do not read them off the meshes at runtime — hardcode them:
  car           4.2 x 1.8 x 1.4
  traffic cone  0.5 x 0.5 x 0.72
  road barrier  2.6 x 0.7 x 0.89
  stalled car   4.2 x 1.8 x 1.4

Make the car's collision box 80% of its visual size, so near misses read as
near misses rather than as unfair hits.

On collision: register a hit and briefly flash the car. Nothing else yet.
```
