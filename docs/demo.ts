import { asJSON, asMaybe, asObject, asString, uncleaner } from 'cleaners'
import fetch from 'node-fetch'
import { base64 } from 'rfc4648'

import {
  asDeviceUpdatePayload,
  asLoginUpdatePayload,
  asPushRequestBody
} from '../src/types/pushApiTypes'

// We are going to use uncleaners to type-check our payloads:
const wasPushRequestBody = uncleaner(asPushRequestBody)
const wasDeviceUpdatePayload = uncleaner(asDeviceUpdatePayload)
const wasLoginUpdatePayload = uncleaner(asLoginUpdatePayload)

/**
 * Failed requests usually return this as their body.
 */
const asErrorBody = asJSON(
  asObject({
    error: asString
  })
)

const server = 'http://127.0.0.1:8001'
const apiKey = 'demo-api-key'
const deviceId = 'example-device'
const loginId = base64.parse('EE+tBb5wM63qwCDVidzwUQThH9ekCSfpUuTQYujSmY8=')

/**
 * All push server HTTP methods use "POST" with JSON.
 */
async function postJson(uri: string, body: unknown): Promise<unknown> {
  console.log(JSON.stringify(body, null, 1))
  const response = await fetch(uri, {
    body: JSON.stringify(body),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    method: 'POST'
  })
  if (!response.ok) {
    const error = asMaybe(asErrorBody)(await response.text())
    let message = `POST ${uri} returned ${response.status}`
    if (error != null) message += `: ${error.error}`
    throw new Error(message)
  }
  return await response.json()
}

async function main(): Promise<void> {
  // Create a device:
  await postJson(
    `${server}/v2/device/update/`,
    wasPushRequestBody({
      apiKey,
      deviceId,
      data: wasDeviceUpdatePayload({ loginIds: [loginId] })
    })
  )
  console.log(`Updated device "${deviceId}"`)

  // Grab the device status:
  console.log(
    await postJson(
      `${server}/v2/device/`,
      wasPushRequestBody({ apiKey, deviceId })
    )
  )

  // Subscribe the user to a price change:
  await postJson(
    `${server}/v2/login/update/`,
    wasPushRequestBody({
      apiKey,
      deviceId,
      loginId,
      data: wasLoginUpdatePayload({
        createEvents: [
          {
            eventId: 'demo-event',
            pushMessage: {
              title: 'Example title',
              body: 'Example body',
              data: { what: 'happened' }
            },
            recurring: false,
            trigger: {
              type: 'price-level',
              currencyPair: 'BTC-USD',
              aboveRate: 50000
            }
          }
        ]
      })
    })
  )
  console.log(`Updated login "${base64.stringify(loginId)}"`)

  // Grab the login status:
  console.log(
    await postJson(
      `${server}/v2/login/`,
      wasPushRequestBody({ apiKey, deviceId, loginId })
    )
  )
}

main().catch(error => {
  console.error(String(error))
  process.exitCode = 1
})
