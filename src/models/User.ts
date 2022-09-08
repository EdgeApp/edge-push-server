/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-dynamic-delete */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */

import { asBoolean, asMap, asObject, asOptional } from 'cleaners'
import { asCouchDoc } from 'edge-server-tools'
import Nano from 'nano'

import { serverConfig } from '../serverConfig'
import { Base } from './base'
import { Device } from './Device'

const nanoDb = Nano(serverConfig.couchUri)
const dbUserSettings =
  nanoDb.db.use<ReturnType<typeof asUser>>('db_user_settings')

const asUserDevices = asMap(asBoolean)
const asUserCurrencyHours = asObject({
  '1': asBoolean,
  '24': asBoolean
})
const asUserCurrencyCodes = asMap(asUserCurrencyHours)
const asUserNotifications = asObject({
  enabled: asOptional(asBoolean),
  currencyCodes: asUserCurrencyCodes
})
const asUser = asObject({
  devices: asUserDevices,
  notifications: asUserNotifications
})
export const asLegacyUser = asCouchDoc(asUser)

export interface INotificationsEnabledViewResponse {
  devices: ReturnType<typeof asUserDevices>
  currencyCodes: ReturnType<typeof asUserCurrencyCodes>
}

export type IDevicesByCurrencyHoursViewResponse = ReturnType<
  typeof asUserDevices
>

export class User extends Base implements ReturnType<typeof asUser> {
  public static table = dbUserSettings
  public static asType = asUser

  public devices: ReturnType<typeof asUserDevices>
  public notifications: ReturnType<typeof asUserNotifications>

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
    return await User.table.view<IDevicesByCurrencyHoursViewResponse>(
      'filter',
      'by-currency',
      { key: [currencyCode, hours] }
    )
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
