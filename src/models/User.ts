import * as Nano from 'nano'
import { asBoolean, asMap, asObject } from 'cleaners'

import { Base } from '.'
import { Device } from './Device'

const CONFIG = require('../../serverConfig.json')

const nanoDb = Nano(CONFIG.dbFullpath)
const dbUserSettings = nanoDb.db.use('db_user_settings')

const IUserDevices = asMap(asBoolean)
const IUserNotifications = asObject({
  currencyCodes: asMap(asObject({
    '1': asBoolean,
    '24': asBoolean
  }))
})
const IUser = asObject({
  devices: IUserDevices,
  notifications: IUserNotifications
})

export class User extends Base implements ReturnType<typeof IUser> {
  public static table = dbUserSettings
  public static asType = IUser

  public devices: ReturnType<typeof IUserDevices>
  public notifications: ReturnType<typeof IUserNotifications>

  constructor(...args) {
    super(...args)

    if (!this.devices)
      this.devices = {}
    if (!this.notifications)
      this.notifications = { currencyCodes: {} }
  }

  public async attachDevice(deviceId: string) {
    const device = await Device.fetch(deviceId)
    if (!device) throw new Error('Device must be registered before attaching to user.')

    this.devices[deviceId] = true

    await this.save()
  }

  public async registerNotifications(currencyCodes: Array<string>) {
    const currencyCodesToUnregister = Object.keys(this.notifications.currencyCodes).filter((code) => !currencyCodes.includes(code))
    for (const code of currencyCodesToUnregister) {
      delete this.notifications.currencyCodes[code]
    }

    for (const code of currencyCodes) {
      if (code in this.notifications.currencyCodes)
        continue

      this.notifications.currencyCodes[code] = {
        '1': true,
        '24': true
      }
    }

    await this.save()
  }
}
