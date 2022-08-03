import { ServerScope } from 'nano'
import { ExpressRequest } from 'serverlet/express'

import { ApiKey } from './pushTypes'

export interface Logger {
  (message: string): void

  debug: (message: string) => void
  debugTime: <T>(message: string, promise: Promise<T>) => Promise<T>
}

export interface LoggedRequest extends ExpressRequest {
  readonly date: Date
  readonly ip: string
  readonly log: Logger
}

export interface DbRequest extends LoggedRequest {
  readonly connection: ServerScope
}

export interface ApiRequest extends DbRequest {
  readonly apiKey: ApiKey

  // Taken from the Express request:
  readonly json: unknown
  readonly query: unknown
}
