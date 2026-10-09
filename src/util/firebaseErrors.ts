import { asMaybe, asObject, asOptional, asString } from 'cleaners'

// The two places Firebase puts its error code, depending on the API version:
const asFirebaseError = asObject({
  code: asOptional(asString),
  errorInfo: asOptional(asObject({ code: asOptional(asString) }))
})

/**
 * True when Firebase reports that a token no longer belongs to an installed
 * app, so the device can never receive anything until it registers again.
 *
 * How this arrives has changed between Firebase versions: the newer API sets a
 * `messaging/registration-token-not-registered` code, the legacy API stringifies
 * to `Error: NotRegistered`, and older releases used a sentence. Match all
 * three, since missing it means the dead token is retried on every send
 * forever, and never gets cleaned up.
 */
export function isUnregisteredToken(error: unknown): boolean {
  const parsed = asMaybe(asFirebaseError)(error)
  if (
    (parsed?.errorInfo?.code ?? parsed?.code) ===
    'messaging/registration-token-not-registered'
  ) {
    return true
  }
  const text = String(error)
  return (
    text.includes('NotRegistered') ||
    text.includes('not a valid FCM registration token')
  )
}
