import { asNumber, asObject, asString } from 'cleaners'

import { Device } from '../../models/Device'
import { asyncRoute } from '../asyncRoute'

/**
 * The GUI names this `registerDevice`, and calls it at boot.
 *
 * POST /v1/device?deviceId=...
 * Request body: asRegisterDeviceRequest
 * Response body: unused
 */
export const registerDeviceV1Route = asyncRoute(async (req, res) => {
  const { deviceId } = asRegisterDeviceQuery(req.query)
  const clean = asRegisterDeviceRequest(req.body)

  let device = await Device.fetch(deviceId)
  if (device) {
    await device.save(clean as any)
    console.log('Device updated.')
  } else {
    device = new Device(clean as any, deviceId)
    await device.save()
    console.log(`Device registered.`)
  }

  res.json(device)
})

const asRegisterDeviceQuery = asObject({
  deviceId: asString
})

const asRegisterDeviceRequest = asObject({
  appId: asString,
  tokenId: asString, // Firebase device token
  deviceDescription: asString,
  osType: asString,
  edgeVersion: asString,
  edgeBuildNumber: asNumber
})
