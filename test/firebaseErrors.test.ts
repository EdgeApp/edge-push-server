import { expect } from 'chai'
import { describe, it } from 'mocha'

import { isUnregisteredToken } from '../src/util/firebaseErrors'

describe('isUnregisteredToken', function () {
  it('matches the error code the current Firebase SDK reports', function () {
    const error = Object.assign(new Error('Requested entity was not found.'), {
      errorInfo: { code: 'messaging/registration-token-not-registered' }
    })
    expect(isUnregisteredToken(error)).equals(true)
  })

  it('matches a bare code property', function () {
    const error = Object.assign(new Error('nope'), {
      code: 'messaging/registration-token-not-registered'
    })
    expect(isUnregisteredToken(error)).equals(true)
  })

  it('matches what the legacy send API stringifies to', function () {
    // This is the exact shape seen in production against firebase-admin 8:
    expect(isUnregisteredToken(new Error('NotRegistered'))).equals(true)
  })

  it('still matches the original wording', function () {
    expect(
      isUnregisteredToken(
        new Error('abc is not a valid FCM registration token')
      )
    ).equals(true)
  })

  it('leaves other failures alone, so a device is never disabled by mistake', function () {
    const cases: unknown[] = [
      new Error('Requested entity was not found'), // no code: too vague to act on
      Object.assign(new Error('quota'), {
        errorInfo: { code: 'messaging/quota-exceeded' }
      }),
      Object.assign(new Error('unavailable'), {
        errorInfo: { code: 'messaging/server-unavailable' }
      }),
      new Error('socket hang up'),
      'a plain string',
      undefined,
      null
    ]
    for (const error of cases) {
      expect(isUnregisteredToken(error), String(error)).equals(false)
    }
  })
})
