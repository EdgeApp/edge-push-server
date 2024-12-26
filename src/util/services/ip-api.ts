import { asEither, asObject, asString, asValue } from 'cleaners'
import fetch from 'node-fetch'

import { syncedServices } from '../../db/couchSettings'
import { Device } from '../../types/pushTypes'

const asApiReply = asEither(
  asObject({
    status: asValue('success'),
    country: asString,
    countryCode: asString,
    region: asString,
    regionName: asString,
    city: asString
  }),
  asObject({
    status: asValue('fail'),
    message: asString
  })
)

export async function locateIp(ip: string): Promise<Device['location']> {
  const { ipApiKey } = syncedServices.doc

  const reply = await fetch(
    `https://pro.ip-api.com/json/${ip}?fields=49183&key=${ipApiKey}`
  )
  if (!reply.ok) {
    throw new Error(`IP lookup returned status code ${reply.status}`)
  }
  const clean = asApiReply(await reply.json())
  if (clean.status !== 'success') {
    throw new Error(`IP lookup returned error message "${clean.message}"`)
  }

  return {
    country: clean.country,
    city: clean.city,
    region: clean.region
  }
}
