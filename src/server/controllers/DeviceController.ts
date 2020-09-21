import { asObject, asString } from 'cleaners'
import * as express from 'express'

import { Device } from '../../models'

export const DeviceController = express.Router()

DeviceController.post('/', async (req, res) => {
  try {
    const asQuery = asObject({
      deviceId: asString
    })

    const { deviceId } = asQuery(req.query)

    let device = await Device.fetch(deviceId)
    if (device) {
      await device.save(req.body)
      console.log('Device updated.')
    } else {
      device = new Device(req.body, deviceId)
      await device.save()
      console.log(`Device registered.`)
    }

    res.json(device)
  } catch (err) {
    console.error(`Failed to register device`, err)
    res.status(500).json(err)
  }
})
