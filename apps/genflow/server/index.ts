// Utility process entry point.
// Körs isolerad från main process via Electron's utilityProcess.fork().

console.log('[server] utility process started, pid:', process.pid)

process.parentPort?.on('message', (event: Electron.MessageEvent) => {
  const msg = event.data as { type?: string } | undefined
  console.log('[server] message from main:', msg)

  if (msg?.type === 'ping') {
    process.parentPort?.postMessage({ type: 'pong' })
  }

  if (msg?.type === 'shutdown') {
    console.log('[server] shutdown received, exiting')
    process.exit(0)
  }
})

// Heartbeat var 30:e sekund så main kan detektera hängt utility process
setInterval(() => {
  process.parentPort?.postMessage({ type: 'heartbeat', timestamp: Date.now() })
}, 30_000)

console.log('[server] ready, awaiting jobs')

// Make this file an ES module so it can be re-exported
export {}
