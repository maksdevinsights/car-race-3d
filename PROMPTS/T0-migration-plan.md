# T0 · Migration plan

**Claude Code**

```
Read this repository and don't change a single file yet.

It's a Three.js / React Three Fiber driving game built with Vite. The car is
stationary in world space and the world scrolls past it — an endless-runner
treadmill. I'm about to break that assumption: the car needs to actually drive
through a town with streets and intersections.

Write me MIGRATION.md containing:

1. Every place in the codebase that assumes the car is stationary, or that the
   world moves, or that the road is infinite and straight. File and line.
2. Every place that assumes obstacles arrive on a single axis.
3. What the collision code currently does, in plain terms, and what breaks
   about it when obstacles surround the car instead of approaching it.
4. The order you'd make these changes in, and what's testable after each step.

Be specific. If something is load-bearing and I haven't noticed, say so in its
own section.
```
