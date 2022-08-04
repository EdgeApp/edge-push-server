import { Command } from 'clipanion'
import { asMaybeNotFoundError, viewToStream } from 'edge-server-tools'
import { base64 } from 'rfc4648'

import { getDeviceById } from '../../db/couchDevices'
import { syncedSettings } from '../../db/couchSettings'
import { asLegacyDevice } from '../../models/Device'
import { asLegacyUser } from '../../models/User'
import { base58 } from '../../util/base58'
import { makeHeartbeat } from '../../util/heartbeat'
import { verifyData } from '../../util/verifyData'
import { ServerContext } from '../cliTools'

export class MigrateDevices extends Command<ServerContext> {
  static paths = [['migrate-devices']]
  static usage = { description: 'Migrate v1 devices to the v2 database' }

  async execute(): Promise<number> {
    const { connection, stdout } = this.context
    const legacyUserDb = connection.use('db_user_settings')
    const legacyDeviceDb = connection.use('db_devices')

    const now = new Date()
    const heartbeat = makeHeartbeat(stdout)

    for await (const raw of viewToStream(
      async params => await legacyUserDb.list(params)
    )) {
      const clean = asLegacyUser(raw)
      const loginId = base58.parse(clean.id)
      const { devices } = clean.doc

      for (const deviceId of Object.keys(devices)) {
        if (!devices[deviceId]) continue

        const raw = await legacyDeviceDb.get(deviceId).catch(error => {
          if (asMaybeNotFoundError(error) != null) return
          throw error
        })
        if (raw == null) continue
        const clean = asLegacyDevice(raw)

        const deviceRow = await getDeviceById(connection, deviceId, now)
        const { device } = deviceRow
        if (deviceRow.exists) {
          // Add the user to the list:
          if (device.loginIds.find(row => verifyData(loginId, row)) == null) {
            device.loginIds = [...device.loginIds, loginId]
            await deviceRow.save()
          }
        } else {
          // Create the device:
          device.deviceToken = clean.doc.tokenId
          if (clean.doc.appId === '') {
            device.apiKey = syncedSettings.doc.apiKeys[0].apiKey
          }
          device.loginIds = [loginId]
          await deviceRow.save()
        }
      }

      heartbeat(base64.stringify(loginId))
    }

    return 0
  }
}
