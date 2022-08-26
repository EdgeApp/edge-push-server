import { asString, Cleaner } from 'cleaners'
import { BaseContext } from 'clipanion'
import { ServerScope } from 'nano'
import { base16, base64 } from 'rfc4648'

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
