// Injected into the page by scripts/verify.mjs before the app loads.
//
// Drives the car along window.__VERIFY_ROUTE with the real keyboard: every
// animation frame it reads the car through the dev hook, picks a point a few
// metres ahead on the route, and holds left / right / up / down the way a
// player would. Plain script, no imports: it runs inside the page.
;(() => {
  const route = window.__VERIFY_ROUTE
  if (!route) return

  // Cumulative distance along the route at each waypoint.
  const along = [0]
  for (let i = 1; i < route.length; i++) {
    along.push(along[i - 1] + Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z))
  }
  const total = along[along.length - 1]

  const status = {
    active: false,
    /** Metres along the route the car has reached. */
    progress: 0,
    leg: 0,
    done: false,
    /** Route progress and frame of the first wall contact on the last leg. */
    impactAt: null,
    frames: 0,
    keys: [],
  }
  window.__autopilot = status

  const held = new Set()
  const press = (code, down) => {
    if (down === held.has(code)) return
    if (down) held.add(code)
    else held.delete(code)
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }))
  }

  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

  function pointAt(s) {
    s = Math.min(s, total)
    let i = 1
    while (i < along.length - 1 && along[i] < s) i++
    const t = (s - along[i - 1]) / (along[i] - along[i - 1] || 1)
    return {
      x: route[i - 1].x + (route[i].x - route[i - 1].x) * t,
      z: route[i - 1].z + (route[i].z - route[i - 1].z) * t,
    }
  }

  /**
   * Projects the car onto the current leg or the next one only — the lap
   * crosses its own path, so a global nearest point would jump legs.
   */
  function project(x, z) {
    let best = { d: Infinity, s: status.progress, leg: status.leg }
    for (let leg = status.leg; leg <= Math.min(status.leg + 1, route.length - 2); leg++) {
      const a = route[leg]
      const b = route[leg + 1]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len2 = dx * dx + dz * dz
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2))
      const px = a.x + dx * t
      const pz = a.z + dz * t
      const d = Math.hypot(x - px, z - pz)
      if (d < best.d) best = { d, s: along[leg] + t * Math.sqrt(len2), leg }
    }
    return best
  }

  function tick() {
    requestAnimationFrame(tick)
    const hook = window.__nightHighway
    if (!status.active || !hook || status.done) return
    const car = hook.car
    status.frames++

    const p = project(car.x, car.z)
    // Never run backwards along the route.
    if (p.s >= status.progress) {
      status.progress = p.s
      status.leg = p.leg
    }

    const last = route[route.length - 1]
    if (status.leg === route.length - 2 && car.scraping && status.impactAt === null) {
      status.impactAt = { progress: status.progress, frame: status.frames }
    }
    // Done a second and a half after the impact, or at the end of the route
    // if the wall turned out to be an open lot.
    if ((status.impactAt && status.frames - status.impactAt.frame > 90) || status.progress >= total - 0.5) {
      status.done = true
      for (const code of [...held]) press(code, false)
      return
    }

    // Slow for the next corner the route marks; full pace into the wall.
    const next = route[status.leg + 1]
    const toNext = along[status.leg + 1] - status.progress
    const target = next.corner && toNext < 24 ? 6 : last === next && next.ram ? 14 : 12.5

    const speed = car.forward
    const lookahead = 4.5 + 0.3 * Math.max(speed, 0)
    const aim = pointAt(status.progress + lookahead)
    const wanted = Math.atan2(aim.x - car.x, aim.z - car.z)
    const error = wrap(wanted - car.yaw)

    // Positive error means the route is to the driver's left.
    press('ArrowLeft', error > 0.03)
    press('ArrowRight', error < -0.03)
    press('ArrowUp', speed < target - 1)
    press('ArrowDown', speed > target + 0.5)
    status.keys = [...held]
  }
  requestAnimationFrame(tick)
})()
