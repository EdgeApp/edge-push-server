import { asString } from 'cleaners'
import { Command, Option } from 'clipanion'

import { getDeviceById } from '../../db/couchDevices'
import { prettify, ServerContext } from '../cliTools'

export class GetDevice extends Command<ServerContext> {
  static paths = [['get-device']]
  static usage = { description: "Shows a device's status" }

  deviceId = Option.String({ name: 'deviceId', required: true })

  async execute(): Promise<number> {
    const { connections, stderr, stdout } = this.context
    const deviceId = asString(this.deviceId)

    const now = new Date()

    const deviceRow = await getDeviceById(connections, deviceId, now)
    if (!deviceRow.exists) {
      stderr.write(`No device ${deviceId}\n`)
      return 1
    }
    stdout.write(prettify(deviceRow.device))

    return 0
  }
}
