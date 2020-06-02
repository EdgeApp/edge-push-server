import * as Nano from 'nano'

import { Base } from '.'
import { Device } from './Device'

const CONFIG = require('../../serverConfig.json')

const nanoDb = Nano(CONFIG.dbFullpath)
const dbUserSettings = nanoDb.db.use('db_user_settings')

interface IUser {
  devices: IUserDevices
  notifications: IUserNotifications
}

interface IUserDevices {
  [deviceId: string]: boolean
}

interface IUserNotifications {
  currencyCodes: {
    [code: string]: {
      '1': boolean
      '24': boolean
    }
  }
}

export class User extends Base implements IUser {
  public static table = dbUserSettings

  public devices: IUserDevices
  public notifications: IUserNotifications

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
    await device.save('userId', this._id)

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
