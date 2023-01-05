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

// ANSI Terminal Escape Sequences:
const ESC = `\x1B[`
const SAVE_POSITION = `${ESC}s`
const RESTORE_POSITION = `${ESC}u`
const CLEAR_LINE = `${ESC}2K`
const CLEAR_AND_RESTORE = `${CLEAR_LINE}${RESTORE_POSITION}`

export interface StatusLogger {
  status: (status: string) => void
  write: (data: any) => void
}

export function makeStatusLogger(stream: Writable): StatusLogger {
  stream.write(SAVE_POSITION)
  return {
    status(status: string): void {
      stream.write(CLEAR_AND_RESTORE)
      stream.write(status.replace(/\n?$/m, '\n'))
    },
    write(data: any) {
      stream.write(data)
      stream.write(SAVE_POSITION)
    }
  }
}
