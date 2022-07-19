import { HttpHeaders, HttpResponse } from 'serverlet'

interface StatusCode {
  httpStatus: number
  message: string
}

/**
 * Construct an HttpResponse object with a JSON body.
 */
export function jsonResponse(
  body: unknown,
  opts: { status?: number; headers?: HttpHeaders } = {}
): HttpResponse {
  const { status = 200, headers = {} } = opts
  return {
    status,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  }
}

/**
 * A generic success or failure response.
 */
export function statusResponse(
  statusCode: StatusCode = statusCodes.SUCCESS,
  message: string = statusCode.message
): HttpResponse {
  const { httpStatus } = statusCode

  return jsonResponse(message, { status: httpStatus })
}

export const statusCodes = {
  SUCCESS: {
    httpStatus: 200,
    message: 'Success'
  },
  INTERNAL_SERVER_ERROR: {
    httpStatus: 500,
    message: 'Internal Server Error'
  },
  PAGE_NOT_FOUND: {
    httpStatus: 404,
    message: 'Page not found'
  }
}
