import { asOptional, asString } from 'cleaners'
import { Command, Option } from 'clipanion'

import { getDeviceById } from '../../db/couchDevices'
import { asBase64 } from '../../types/pushCleaners'
import { makePushSender, SendableMessage } from '../../util/pushSender'
import { ServerContext } from '../cliTools'

export class SendMessage extends Command<ServerContext> {
  static paths = [['send-message']]
  static usage = { description: 'Send a message to a user or device' }

  deviceId = Option.String('--deviceId', {
    tolerateBoolean: false
  })

  loginId = Option.String('--loginId', {
    tolerateBoolean: false
  })

  title = Option.String('--title', {
    tolerateBoolean: false
  })

  body = Option.String({
    name: 'body',
    required: true
  })

  async execute(): Promise<number> {
    const { connections, stderr } = this.context
    const deviceId = asOptional(asString)(this.deviceId)
    const loginId = asOptional(asBase64)(this.loginId)
    const title = asOptional(asString, 'Test Message')(this.title)

    const sender = makePushSender(connections)
    const message: SendableMessage = {
      title,
      body: this.body,
      isMarketing: false, // This tool is used for testing
      isPriceChange: false
    }

    if (loginId != null) {
      await sender.sendToLogin(loginId, message)
    } else if (deviceId != null) {
      const deviceRow = await getDeviceById(connections, deviceId, new Date())
      await sender.sendToDevice(deviceRow.device, message)
    } else {
      stderr.write('No deviceId or loginId\n')
      return 1
    }

    // The Firebase SDK leaves junk around:
    process.exit(0)
  }
}
