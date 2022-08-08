import { asString, Cleaner } from 'cleaners'
import { BaseContext } from 'clipanion'
import { ServerScope } from 'nano'
import { base16, base64 } from 'rfc4648'
import { Writable } from 'stream'

export interface ServerContext extends BaseContext {
  connection: ServerScope
}

export const asNumberString: Cleaner<number> = raw => {
  const out = Number(asString(raw))
  if (Number.isNaN(out)) throw new TypeError('Expected a number string')
  return out
}

export function prettify(data: unknown): string {
  return JSON.stringify(
    data,
    (key, value) =>
      value instanceof Uint8Array
        ? /_hex$/.test(key)
          ? base16.stringify(value)
          : base64.stringify(value)
        : value,
    1
  )
}

/**
 * For long-running database tasks,
 * print a heartbeat to stderr every few seconds.
 */
export function makeHeartbeat(
  stderr: Writable,
  opts: { logSeconds?: number } = {}
): (item?: string) => void {
  const { logSeconds = 10 } = opts

  const start = Date.now()
  let nextLog = start + 1000 * logSeconds

  let count = 0
  return item => {
    ++count
    const now = Date.now()
    if (now < nextLog) return

    nextLog += 1000 * logSeconds
    const seconds = (now - start) / 1000
    let out = `${seconds.toFixed(2)}s, ${count} rows`
    if (item != null) out += `, ${item}`
    out += '\n'
    stderr.write(out)
  }
}
