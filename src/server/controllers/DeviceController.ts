import * as express from 'express'
import { asObject, asString } from 'cleaners'

import { Device } from '../../models'

export const DeviceController = express.Router()

DeviceController.post('/', async (req, res) => {
  try {
    const Query = asObject({
      deviceId: asString
    })
    Query(req.query)

    const { deviceId } = req.query as ReturnType<typeof Query>

    let device = await Device.fetch(deviceId)
    if (device) {
      console.log('Device already registered.')
    } else {
      device = new Device(req.body, deviceId)
      await device.save()
      console.log(`Device registered`)
    }

    res.json(device)
  } catch (err) {
    console.error(`Failed to register device`, err)
    res.json(err)
  }
})
