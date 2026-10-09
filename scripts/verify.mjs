// Visual verification loop: npm run verify
//
// Boots its own Vite dev server, opens the game in headless Chrome, and
// drives a fixed route through the town with the keyboard: a lap of a block,
// two more turns, and one deliberate collision with a building. Screenshots
// land in verify-shots/ at fixed points along the route.
//
// Every run is the same run. Playwright's fake clock advances the page one
// 16 ms frame at a time, and Math.random is replaced with a seeded generator
// before the app loads, so obstacles, frame deltas and inputs all repeat.

import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startServer } from './devServer.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'verify-shots')
// Not 5173, so it never collides with a dev server already running.
const PORT = 5199
const FRAME_MS = 16
const VIEWPORT = { width: 1280, height: 720 }

/**
 * Console output that is known and not ours, so it does not fail the run.
 * R3F 9 still drives its loop with THREE.Clock, which three r185 deprecates.
 */
const IGNORED = [/THREE\.Clock: This module has been deprecated/]

/**
 * The car starts at the origin facing +Z on avenue 0. Streets run along X at
 * z = 40 + 80j, avenues along Z at x = 80i.
 *   - north to the first junction, left onto street z = 40
 *   - a lap of block (1, 1): (80,40) → (160,40) → (160,120) → (80,120) → (80,40)
 *   - straight on south, then two right turns: onto z = -40, onto x = 160
 *   - north up avenue 160, then a hard swerve left into the building on the
 *     kerb at x = 164, z 15–36 (the frontage just south of it is an open lot)
 */
const ROUTE = [
  { x: 0, z: 0 },
  { x: 0, z: 40, corner: true },
  { x: 80, z: 40 },
  { x: 160, z: 40, corner: true },
  { x: 160, z: 120, corner: true },
  { x: 80, z: 120, corner: true },
  { x: 80, z: 40 },
  { x: 80, z: -40, corner: true },
  { x: 160, z: -40, corner: true },
  { x: 160, z: 14 },
  { x: 180, z: 30, ram: true },
]

/** Screenshot points, by metres along the route. */
const SHOTS = [
  { at: 2, name: '01-start' },
  { at: 30, name: '02-approach-first-junction' },
  { at: 44, name: '03-left-turn-mid' },
  { at: 100, name: '04-street-z40-past-avenue-80' },
  { at: 190, name: '05-lap-approach-corner-160-40' },
  { at: 206, name: '06-lap-corner-160-40-mid-turn' },
  { at: 250, name: '07-lap-avenue-160' },
  { at: 286, name: '08-lap-corner-160-120-mid-turn' },
  { at: 330, name: '09-lap-street-z120' },
  { at: 366, name: '10-lap-corner-80-120-mid-turn' },
  { at: 445, name: '11-lap-closed-crossing-80-40' },
  { at: 524, name: '12-right-turn-1-mid' },
  { at: 604, name: '13-right-turn-2-mid' },
  { at: 646, name: '14-pre-collision-swerve' },
]

/**
 * Seeded Math.random, installed before any app code runs. __reseed() restarts
 * the sequence, so the run itself starts from the same state however many
 * frames the start screen happened to use up.
 */
const SEED_SCRIPT = `
  (() => {
    let a = 0
    window.__reseed = () => (a = 0x5eed1234 >>> 0)
    window.__reseed()
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  })()
`

async function main() {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  const server = startServer({ root: ROOT, port: PORT })
  process.on('exit', server.stop)
  await server.ready

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
  })
  const report = { shots: [], samples: [], errors: [] }

  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    page.on('pageerror', (error) => report.errors.push(String(error)))
    page.on('console', (message) => {
      if (message.type() !== 'error' && message.type() !== 'warning') return
      if (IGNORED.some((pattern) => pattern.test(message.text()))) return
      report.errors.push(message.text())
    })

    await page.addInitScript(SEED_SCRIPT)
    await page.addInitScript((route) => (window.__VERIFY_ROUTE = route), ROUTE)
    await page.addInitScript({ path: path.join(ROOT, 'scripts/verify-autopilot.js') })
    await page.clock.install({ time: 0 })
    await page.goto(`http://localhost:${PORT}/`)
    // install() leaves the fake clock running in real time; pause it so the
    // page only moves when this script steps it.
    // An hour ahead, so it is in the future however long the page took to
    // load; jumping there fires each pending timer once.
    await page.clock.pauseAt(3_600_000)

    const step = (frames) => page.clock.runFor(frames * FRAME_MS)
    const read = () =>
      page.evaluate(() => {
        const hook = window.__nightHighway
        const pilot = window.__autopilot
        if (!hook) return null
        const { car, camera, game } = hook
        const cam = camera.current
        const cameraInside = hook.cameraInside()
        const carOverlap = hook.carOverlap()
        return {
          progress: pilot.progress,
          done: pilot.done,
          impactAt: pilot.impactAt,
          keys: pilot.keys,
          car: { x: car.x, z: car.z, yaw: car.yaw, forward: car.forward, offRoad: car.offRoad, scraping: car.scraping },
          camera: cam ? { x: cam.position.x, y: cam.position.y, z: cam.position.z } : null,
          cameraInside,
          carOverlap,
          game: game(),
        }
      })

    // Let the models load and the start screen settle, then start a run.
    for (let i = 0; i < 400 && !(await read()); i++) await step(5)
    await step(30)
    // Start a run. React remounts the scene on its own (real-time) scheduler,
    // so wait for the fresh car at the origin before advancing a single fake
    // frame — otherwise the remount lands on a different frame each run.
    await page.evaluate(() => window.__reseed())
    await page.keyboard.press('Enter')
    // Polled from Node: the page's own timers and frames are frozen.
    const fresh = () =>
      page.evaluate(() => {
        const hook = window.__nightHighway
        return Boolean(hook && hook.game().phase === 'playing' && hook.car.z === 0)
      })
    for (let tries = 0; !(await fresh()); tries++) {
      if (tries > 200) throw new Error('the run never started after Enter')
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    // The delivery clock would end the run long before the route does.
    await page.evaluate(() => window.__nightHighway.grantTime(600))
    await page.evaluate(() => (window.__autopilot.active = true))

    const shoot = async (name, state) => {
      const file = path.join(OUT, `${name}.png`)
      await page.screenshot({ path: file })
      report.shots.push({ name, ...state })
      console.log(`  ${name.padEnd(36)} progress ${state.progress.toFixed(0).padStart(4)} m  car (${state.car.x.toFixed(1)}, ${state.car.z.toFixed(1)})  ${state.car.forward.toFixed(1)} m/s  lives ${state.game.lives}  delivered ${state.game.score} m`)
    }

    let next = 0
    let impactShot = 0
    const started = Date.now()
    for (let frame = 0; frame < 60 * 120; frame += 2) {
      await step(2)
      const state = await read()
      if (!state) continue
      if (frame % 30 === 0) report.samples.push(state)
      // Checked every step, not just at screenshots: what a still can miss.
      if (state.cameraInside) report.errors.push(`camera inside a building at ${state.progress.toFixed(0)} m`)
      if (state.carOverlap > 0.01) {
        report.errors.push(`car body ${state.carOverlap.toFixed(2)} m inside a solid at ${state.progress.toFixed(0)} m`)
      }

      while (next < SHOTS.length && state.progress >= SHOTS[next].at) {
        await shoot(SHOTS[next].name, state)
        next++
      }
      if (state.impactAt && impactShot === 0) {
        await shoot('15-impact', state)
        impactShot = frame
      }
      if (impactShot && frame - impactShot >= 30 && impactShot > 0) {
        await shoot('16-after-impact', state)
        impactShot = -1
      }
      if (state.game.phase === 'over' && !state.done) {
        report.errors.push(`game over at ${state.progress.toFixed(0)} m — route not finished`)
        await shoot('99-game-over', state)
        break
      }
      if (state.done) break
    }

    // Game states: deliver to the beacon, then let the clock run out.
    if (report.errors.length === 0) {
      const before = await read()
      await page.evaluate(() => {
        const hook = window.__nightHighway
        const [x, z] = hook.target()
        // Park the car 30 m short of the beacon, facing it, and give the
        // chase camera a second to swing round behind it.
        Object.assign(hook.car, { x, z: z - 30, yaw: 0, forward: 0, lateral: 0, yawRate: 0, steer: 0 })
      })
      await step(60)
      await shoot('17-beacon-ahead', await read())
      await page.evaluate(() => {
        const hook = window.__nightHighway
        const [x, z] = hook.target()
        Object.assign(hook.car, { x, z: z - 1, forward: 2 })
      })
      await step(4)
      const after = await read()
      if (after.game.deliveries !== before.game.deliveries + 1 || after.game.score <= before.game.score) {
        report.errors.push(`delivery not banked: ${JSON.stringify({ before: before.game, after: after.game })}`)
      } else {
        console.log(`  delivery banked: +${after.game.score - before.game.score} m, clock ${before.game.timeLeft} → ${after.game.timeLeft} s`)
      }
      await page.evaluate(() => window.__nightHighway.grantTime(-10000))
      await step(4)
      const over = await read()
      if (over.game.phase !== 'over' || over.game.reason !== 'time') {
        report.errors.push(`clock ran out but phase is ${over.game.phase} (${over.game.reason})`)
      }
      await step(10)
      await shoot('18-out-of-time-card', over)
    }

    const missed = SHOTS.slice(next).map((s) => s.name)
    if (missed.length) report.errors.push(`never reached: ${missed.join(', ')}`)
    console.log(`\n${report.shots.length} screenshots in ${((Date.now() - started) / 1000).toFixed(0)} s → verify-shots/`)
  } finally {
    await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
    await browser.close()
    server.stop()
  }

  if (report.errors.length) {
    console.log('\nProblems:')
    for (const error of report.errors) console.log(`  - ${error}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
