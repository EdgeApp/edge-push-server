import { ServerScope } from 'nano'
import { ExpressRequest } from 'serverlet/express'

import { ApiKey } from './pushTypes'

export interface DbRequest extends ExpressRequest {
  readonly connection: ServerScope
}

export interface ApiRequest extends DbRequest {
  readonly apiKey: ApiKey

  // Taken from the Express request:
  json: unknown
  query: unknown
}
