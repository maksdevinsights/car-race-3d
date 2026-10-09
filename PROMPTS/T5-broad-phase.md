# T5 · Collision from every side

**Claude Code**

```
Collision currently assumes obstacles approach on one axis. Now they surround
the car.

Build broad-phase collision using a spatial hash keyed off the road network,
so only nearby buildings are ever tested. Narrow phase stays as simple box
checks like the original.

Still no physics engine.

Add to /debug: highlight every collider currently being tested, in red. I want
to see that it's testing four buildings and not four hundred.
```
