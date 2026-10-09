# T2 · Steering through the network

**Claude Code**

```
Now make the car steer through the network.

Front wheels point, the body follows, and the car carries speed through a
corner instead of snapping to a new heading. It should be possible to take a
corner badly.

The car must stay on the road surface without a physics engine. Use the lane
geometry from the road network to work out where the road is, not a collision
mesh.

Constraints:
- No physics library. Nothing added to package.json except what already
  exists.
- Speed affects turn radius. Faster means wider.
- If the car leaves the road surface, slow it down. Don't hard-block it — let
  it be a mistake the player feels.
```

There was no road network yet, only the straight road. Claude Code stopped
and asked how to get one; the answer chosen was:

> **Minimal grid now** — a lane-geometry module for an endless street grid
> (streets every 80 m both ways, intersections built in code, road tiles
> streamed in 2D around the car), then the steering model on top. Obstacles
> stay on the original avenue until collision handles rotation.
