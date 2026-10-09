// Frame-time measurement: npm run perf [-- --root <checkout> --label <name>]
//
// Builds the given checkout (this one by default), serves the production
// build, and lets the car cruise on the start screen — in every version of
// the game it drives straight on at 16 m/s by itself — while measuring:
//
//   - frame time: the interval between animation frames, with vsync and the
//     frame-rate cap switched off, so it is what a frame actually costs (CPU
//     and GPU together) rather than a flat 16.7 ms;
//   - frame cost: time inside the page's animation-frame callbacks *plus*
//     waiting for the GPU to finish that frame (a 1-pixel readPixels after
//     each frame forces it). Uncapped intervals alone hide GPU work, which
//     Chrome pipelines behind the next frame;
//   - CPU per frame: the same without the GPU wait;
//   - draw calls and triangles per frame, counted on the WebGL context.
//
// Nothing in the app is hooked, so the same script measures the original
// commit and the current build alike. Three runs per checkout; the median
// run is reported.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startServer } from './devServer.mjs'

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`)
  return at >= 0 ? process.argv[at + 1] : fallback
}
const ROOT = path.resolve(arg('root', HERE))
const LABEL = arg('label', path.basename(ROOT))
const PORT = Number(arg('port', 5198))
const RUNS = 3
const WARMUP_MS = 3000
const MEASURE_MS = 12000

/** Counts every frame's callbacks and draw calls; installed before the app loads. */
const PROBE = `
  (() => {
    const frames = []
    let current = null
    let gl = null
    const pixel = new Uint8Array(4)
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const context = getContext.call(this, type, ...rest)
      if (type === 'webgl2' || type === 'webgl') gl = context
      return context
    }
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (callback) =>
      raf((time) => {
        if (!current || current.time !== time) {
          if (current) frames.push(current)
          current = { time, cpu: 0, cost: 0, draws: 0, triangles: 0 }
        }
        const start = performance.now()
        try {
          callback(time)
        } finally {
          const cpuEnd = performance.now()
          current.cpu += cpuEnd - start
          // Wait for the GPU to finish everything this callback submitted.
          if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
          current.cost += performance.now() - start
        }
      })

    const TRIANGLES = 4
    const count = (mode, vertices, instances) => {
      if (!current) return
      current.draws++
      if (mode === TRIANGLES) current.triangles += (vertices / 3) * instances
    }
    for (const Context of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const proto = Context.prototype
      for (const [name, instanced] of [
        ['drawArrays', false],
        ['drawElements', false],
        ['drawArraysInstanced', true],
        ['drawElementsInstanced', true],
      ]) {
        const original = proto[name]
        if (!original) continue
        proto[name] = function (...args) {
          const mode = args[0]
          const vertices = name.startsWith('drawArrays') ? args[2] : args[1]
          const instances = instanced ? args[name === 'drawArraysInstanced' ? 3 : 4] : 1
          count(mode, vertices, instances)
          return original.apply(this, args)
        }
      }
    }
    window.__perf = { frames, reset: () => (frames.length = 0) }
  })()
`

const SEED = `
  (() => {
    let a = 0x5eed1234 >>> 0
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  })()
`

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length

async function measure(page) {
  await page.reload()
  await page.waitForSelector('canvas')
  await page.waitForTimeout(WARMUP_MS)
  await page.evaluate(() => window.__perf.reset())
  await page.waitForTimeout(MEASURE_MS)
  const frames = await page.evaluate(() => window.__perf.frames.slice(1))
  const intervals = frames.slice(1).map((f, i) => f.time - frames[i].time).sort((a, b) => a - b)
  return {
    frames: frames.length,
    frameMs: mean(intervals),
    p50: percentile(intervals, 0.5),
    p95: percentile(intervals, 0.95),
    p99: percentile(intervals, 0.99),
    cpuMs: mean(frames.map((f) => f.cpu)),
    costMs: mean(frames.map((f) => f.cost)),
    costP95: percentile(frames.map((f) => f.cost).sort((a, b) => a - b), 0.95),
    draws: mean(frames.map((f) => f.draws)),
    triangles: mean(frames.map((f) => f.triangles)),
  }
}

async function main() {
  const server = startServer({ root: ROOT, port: PORT, mode: 'preview' })
  process.on('exit', server.stop)
  await server.ready

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })
    await page.addInitScript(SEED)
    await page.addInitScript(PROBE)
    await page.goto(`http://localhost:${PORT}/`)

    const runs = []
    for (let i = 0; i < RUNS; i++) runs.push(await measure(page))
    runs.sort((a, b) => a.costMs - b.costMs)
    const median = runs[Math.floor(runs.length / 2)]

    const f = (v, d = 2) => v.toFixed(d)
    console.log(
      `${LABEL.padEnd(18)} frame cost ${f(median.costMs)} ms (p95 ${f(median.costP95)})   CPU ${f(median.cpuMs)} ms` +
        `   interval ${f(median.frameMs)} ms   draws ${f(median.draws, 0)}   triangles ${f(median.triangles, 0)}` +
        `   [cost per run: ${runs.map((r) => f(r.costMs)).join(' / ')} ms]`,
    )
  } finally {
    await browser.close()
    server.stop()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
