# C1 · Load the assets

**Claude Code**

```
I have five GLB files exported from a 3D design tool, all in metres:

  car.glb           4.2 x 1.8 x 1.4
  traffic-cone.glb  0.5 x 0.5 x 0.72
  road-barrier.glb  2.6 x 0.7 x 0.89
  stalled-car.glb   4.2 x 1.8 x 1.4
  road-segment.glb  8 x 9, designed to repeat every 9 metres

Load them with useGLTF from drei and preload all five. One component per
asset: Car, TrafficCone, RoadBarrier, StalledCar, RoadSegment.

There is no roadside asset. Generate it in code: a flat ground plane either
side of the road in #161B22, with a handful of low faceted hills in #30363D
set well back from the edge. Keep it simple, it is scenery.

Lay out four road segments end to end with the car on them and one of each
obstacle placed nearby, so I can confirm everything loads at consistent scale
against each other.

Camera 6 metres behind the car and 3 metres above it, angled slightly down,
55 degree field of view.

Add no behaviour. Static scene only.
```
