import { asBoolean, asMap, asObject, asOptional } from 'cleaners'
import * as Nano from 'nano'

import { Base } from '.'
import { Device } from './Device'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CONFIG = require('../../serverConfig.json')

const nanoDb = Nano(CONFIG.dbFullpath)
const dbUserSettings =
  nanoDb.db.use<ReturnType<typeof IUser>>('db_user_settings')

const IUserDevices = asMap(asBoolean)
const IUserCurrencyHours = asObject({
  '1': asBoolean,
  '24': asBoolean
})
const IUserCurrencyCodes = asMap(IUserCurrencyHours)
const IUserNotifications = asObject({
  enabled: asOptional(asBoolean),
  currencyCodes: IUserCurrencyCodes
})
const IUser = asObject({
  devices: IUserDevices,
  notifications: IUserNotifications
})

export interface INotificationsEnabledViewResponse {
  devices: ReturnType<typeof IUserDevices>
  currencyCodes: ReturnType<typeof IUserCurrencyCodes>
}

export type IDevicesByCurrencyHoursViewResponse = ReturnType<
  typeof IUserDevices
>

export class User extends Base implements ReturnType<typeof IUser> {
  public static table = dbUserSettings
  public static asType = IUser

  public devices: ReturnType<typeof IUserDevices>
  public notifications: ReturnType<typeof IUserNotifications>

  // @ts-expect-error
  constructor(...args) {
    super(...args)

    // @ts-expect-error
    if (!this.devices) this.devices = {}
    // @ts-expect-error
    if (!this.notifications) {
      this.notifications = {
        enabled: true,
        currencyCodes: {}
      }
    }
  }

  // Fetch data for users that have notifications enabled using CouchDB Design Document View
  // https://notif1.edge.app:6984/_utils/#/database/db_user_settings/_design/filter/_view/by-currency
  public static async devicesByCurrencyHours(
    currencyCode: string,
    hours: string
  ) {
    return User.table.view<IDevicesByCurrencyHoursViewResponse>(
      'filter',
      'by-currency',
      { key: [currencyCode, hours] }
    )
  }

  public async attachDevice(deviceId: string) {
    const device = await Device.fetch(deviceId)
    if (!device)
      throw new Error('Device must be registered before attaching to user.')

    this.devices[deviceId] = true

    await this.save()
  }

  public async fetchDevices(): Promise<Device[]> {
    const devices: Device[] = []

    let updated = false
    for (const deviceId in this.devices) {
      const device = await Device.fetch(deviceId)
      if (device) {
        devices.push(device)
        continue
      }

      delete this.devices[deviceId]
      updated = true
    }

    if (updated) await this.save()

    return devices
  }

  public async registerNotifications(currencyCodes: string[]) {
    const currencyCodesToUnregister = Object.keys(
      this.notifications.currencyCodes
    ).filter(code => !currencyCodes.includes(code))
    for (const code of currencyCodesToUnregister) {
      delete this.notifications.currencyCodes[code]
    }

    for (const code of currencyCodes) {
      if (code in this.notifications.currencyCodes) continue

      this.notifications.currencyCodes[code] = {
        '1': true,
        '24': true
      }
    }

    await this.save()
  }
}
