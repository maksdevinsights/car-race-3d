// Starts Vite for the scripts in this folder: the dev server, or a production
// build served by `vite preview`. Either way the whole process group is
// killed on stop(), so no stray esbuild or vite is left behind.

import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'

/**
 * @param {{ root: string, port: number, mode?: 'dev' | 'preview' }} options
 * `root` can be any checkout of this repo; `preview` builds it first.
 */
export function startServer({ root, port, mode = 'dev' }) {
  const outDir = path.join(root, 'dist-scripts')
  if (mode === 'preview') {
    const build = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: root,
      encoding: 'utf8',
    })
    if (build.status !== 0) throw new Error(`build failed in ${root}:\n${build.stdout}${build.stderr}`)
  }

  const args = mode === 'preview' ? ['vite', 'preview', '--outDir', outDir] : ['vite']
  const server = spawn('npx', [...args, '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let log = ''
  server.stdout.on('data', (chunk) => (log += chunk))
  server.stderr.on('data', (chunk) => (log += chunk))
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${log}`)), 30000)
    server.stdout.on('data', () => {
      if (log.includes(`localhost:${port}`)) {
        clearTimeout(timer)
        resolve()
      }
    })
    server.on('exit', (code) => reject(new Error(`server exited (${code}):\n${log}`)))
  })
  const stop = () => {
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
  }
  return { ready, stop }
}
