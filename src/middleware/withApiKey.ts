import { Serverlet } from 'serverlet'

import { getApiKeyByKey } from '../db/couchApiKeys'
import { ApiRequest, DbRequest } from '../types/requestTypes'
import { errorResponse } from '../types/responseTypes'

/**
 * Checks the API key passed in the request headers,
 * then passes the request along if the key is valid.
 */
export const withApiKey =
  (server: Serverlet<ApiRequest>): Serverlet<DbRequest> =>
  async request => {
    const { connection, headers, log } = request

    // Parse the key out of the headers:
    const header = headers['x-api-key']
    if (header == null || header === '') {
      return errorResponse('Missing API key', { status: 401 })
    }

    // Look up the key in the database:
    const apiKey = await log.debugTime(
      'getApiKeyByKey',
      getApiKeyByKey(connection, header)
    )
    if (apiKey == null) {
      return errorResponse('Incorrect API key', { status: 401 })
    }

    // Pass that along:
    return await server({
      ...request,
      apiKey,
      json: request.req.body,
      query: request.req.query
    })
  }
