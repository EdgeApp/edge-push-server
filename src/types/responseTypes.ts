import { HttpHeaders, HttpResponse } from 'serverlet'

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
 * Construct an HttpResponse object with an error message.
 */
export function errorResponse(
  error: string,
  opts: { status?: number; headers?: HttpHeaders } = {}
): HttpResponse {
  const { status = 500, headers = {} } = opts
  return {
    status,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ error })
  }
}

export class UnavailableError extends Error {}
