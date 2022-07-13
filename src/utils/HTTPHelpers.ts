/**
 * A collection of helper methods to strengthen the `serverlet` library,
 * which was designed to be safe to use for the Edge login server.
 * However, the `serverlet` library is not feature rich. Many of the
 * basic HTTP methods and properties are not supported.
 *
 * Instead of making patches to the `serverlet` library, this helper
 * file implements a set of basic HTTP methods to make the `serverlet`
 * library more comparable to express.js.
 */

import { URLSearchParams } from 'url'

/**
 * Given a URL path and an array of query parameter names, returns an
 * object with keys for each query parameter name and values for each
 * query
 *
 * For example, given the following URL path: `v1/device?deviceId=12345`
 * and the query parameter name `deviceId`, the function will return the
 * string `12345`.
 *
 * @param query An array of query parameter names.
 * @param path  The URL path.
 * @returns     The object of query parameters.
 */
export const getQueryParamObject = (
  query: string[],
  path: string
): { [index: string]: any } => {
  const urlParams = new URLSearchParams(path)
  const result: { [index: string]: any } = {}
  query.forEach(param => (result[param] = urlParams.get(param) ?? ''))
  return result
}

/**
 * Converts a string to an array of strings.
 * @param str The string to be converted to an array.
 * @returns   An array of strings.
 */
export const convertStringToArray = (str: string): string[] | undefined => {
  str = str.trim()
  if (str.length < 2 || (str[0] !== '[' && str[str.length - 1] !== ']')) {
    return undefined
  }
  return str.split(',').map(s => s.trim())
}
