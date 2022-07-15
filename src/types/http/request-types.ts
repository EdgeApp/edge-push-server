import { ExpressRequest } from 'serverlet/express'

import { ApiKey } from '../../models'

export interface ExtendedRequest extends ExpressRequest {
  readonly body: any
}

export interface ApiRequest extends ExtendedRequest {
  readonly apiKey: ApiKey
  readonly payload: unknown
}
