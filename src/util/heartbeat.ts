/**
 * Logs the status of a long-running process.
 */
export interface Heartbeat {
  (item?: string): void
  getSeconds: () => number
}

interface WritableLike {
  write: (chunk: string) => void
}

/**
 * For long-running database tasks,
 * print a heartbeat to stderr every few seconds.
 */
export function makeHeartbeat(
  stderr: WritableLike,
  opts: { logSeconds?: number } = {}
): Heartbeat {
  const { logSeconds = 10 } = opts

  const start = Date.now()
  function getSeconds(): number {
    const now = Date.now()
    return (now - start) / 1000
  }

  let count = 0
  let nextSeconds = logSeconds
  function out(item?: string): void {
    ++count
    const seconds = getSeconds()
    if (seconds < nextSeconds) return
    nextSeconds += logSeconds

    let out = `${seconds.toFixed(2)}s, ${count} rows`
    if (item != null) out += `, ${item}`
    out += '\n'
    stderr.write(out)
  }

  out.getSeconds = getSeconds
  return out
}
