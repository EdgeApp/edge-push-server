import { Cleaner } from 'cleaners'
import { HttpResponse } from 'serverlet'

import { errorResponse } from '../types/responseTypes'

type CheckedPayload<T> =
  | { clean: T; error: undefined }
  | { error: HttpResponse }

/**
 * Checks some data with a cleaner,
 * and makes an HTTP error response if something goes wrong.
 */
export function checkPayload<T>(
  cleaner: Cleaner<T>,
  raw: unknown
): CheckedPayload<T> {
  try {
    return {
      clean: cleaner(raw),
      error: undefined
    }
  } catch (error) {
    return {
      error: errorResponse(String(error), { status: 400 })
    }
  }
}
