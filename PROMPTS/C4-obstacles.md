# C4 · Obstacles

**Claude Code**

```
Spawn obstacles from the three loaded types at random positions across the
8 metre road, at a fixed interval ahead of the camera, moving toward it at the
same speed as the road. Recycle them once they pass behind the camera.

Use object pooling. Do not create and destroy meshes on every spawn.

Widths to work with: traffic cone 0.5m, road barrier 2.6m, stalled car 1.8m.

Hard constraint: after placing every obstacle in a row, there must be at least
2.5 metres of continuous clear lateral space somewhere across the road. The
player car is 1.8m wide, so anything tighter than that is not a challenge, it
is an unavoidable hit. Reject and regenerate any row that fails this check.

No collision yet.
```
