import io from '@pm2/io'
import { asMaybeNotFoundError, stringifyError } from 'edge-server-tools'
import { HttpResponse, Serverlet } from 'serverlet'
import { ExpressRequest } from 'serverlet/express'

import { syncedSettings } from '../../db/couchSettings'
import { LoggedRequest } from '../../types/requestTypes'
import { jsonResponse, UnavailableError } from '../../types/responseTypes'
import { slackAlert } from '../../util/slackAlert'

const requestMeter = io.meter({
  id: 'request:meter',
  name: 'Total Request Frequency'
})

/**
 * Log the final outcome of a server call.
 */
export const withLogging =
  (server: Serverlet<LoggedRequest>): Serverlet<ExpressRequest> =>
  async request => {
    const { method, req } = request
    const { ip, originalUrl } = req

    // Log to PM2:
    requestMeter.mark()

    const date = new Date()
    const logs: string[] = []
    function log(message: string): void {
      logs.push(`${Date.now() - date.valueOf()}ms: ${message}`)
    }
    log.debug = function debug(message: string): void {
      if (syncedSettings.doc.debugLogs) log(message)
    }
    log.debugTime = async function debugTime<T>(
      message: string,
      promise: Promise<T>
    ): Promise<T> {
      const start = Date.now()
      const out = await promise
      log.debug(message + ` took ${Date.now() - start}ms`)
      return out
    }

    async function runServer(): Promise<HttpResponse> {
      return await server({ ...request, date, ip, log })
    }
    const response = await runServer().catch(error => {
      log(stringifyError(error))

      // Some errors have special HTTP statuses:
      if (error instanceof UnavailableError) return { status: 503 }
      if (asMaybeNotFoundError(error) != null) {
        return jsonResponse({ error: error.message }, { status: 404 })
      }
      return { status: 500 }
    })

    const { status = 200 } = response
    const duration = Date.now() - date.valueOf()
    logs.unshift(
      `${date.toISOString()} ${ip} ${method} ${originalUrl} ${status} ${duration}ms`
    )
    const message = logs.join('\n  + ')
    console.log(message)
    if (status === 500) slackAlert(message)
    return response
  }
