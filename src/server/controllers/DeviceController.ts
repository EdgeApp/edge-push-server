import { asNumber, asObject, asString } from 'cleaners'
import { Serverlet } from 'serverlet'

import { Device } from '../../models/Device'
import { ApiRequest } from '../../types/requestTypes'
import { jsonResponse } from '../../types/responseTypes'

/**
 * The GUI names this `registerDevice`, and calls it at boot.
 *
 * POST /v1/device?deviceId=...
 * Request body: asRegisterDeviceRequest
 * Response body: unused
 */
export const registerDeviceV1Route: Serverlet<ApiRequest> = async request => {
  const { json, log, query } = request
  const { deviceId } = asRegisterDeviceQuery(query)
  const clean = asRegisterDeviceRequest(json)

  let device = await Device.fetch(deviceId)
  if (device) {
    await device.save(clean as any)
    log('Device updated.')
  } else {
    device = new Device(clean as any, deviceId)
    await device.save()
    log(`Device registered.`)
  }

  return jsonResponse(device)
}

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
