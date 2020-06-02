import * as express from 'express'
import { Device } from '../../models'

export const DeviceController = express.Router()

DeviceController.post('/', async (req, res) => {
  try {
    type Query = { deviceId: string }
    const { deviceId } = req.query as Query
    let device = await Device.fetch(deviceId)
    if (device) throw new Error('Device already exists!')

    device = new Device(req.body, deviceId)
    await device.save()

    res.json(device)
  } catch (err) {
    res.json(err)
  }
})

DeviceController.get('/', async (req, res) => {
  try {
    type Query = { deviceId: string }
    const { deviceId } = req.query as Query
    const device = await Device.fetch(deviceId)

    res.json(device)
  } catch (err) {
    res.json(err)
  }
})
