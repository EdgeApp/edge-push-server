import { asOptional, asString } from 'cleaners'
import { Command, Option } from 'clipanion'

import { asBase64 } from '../../types/pushCleaners'
import { makePushSender } from '../../util/pushSender'
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
    const { connection, stderr } = this.context
    const deviceId = asOptional(asString)(this.deviceId)
    const loginId = asOptional(asBase64)(this.loginId)
    const title = asOptional(asString, 'Test Message')(this.title)

    if (loginId == null && deviceId == null) {
      stderr.write('No deviceId or loginId\n')
      return 1
    }

    const now = new Date()
    const sender = makePushSender(connection)
    await sender.send(
      connection,
      { title, body: this.body },
      { date: now, deviceId, loginId }
    )

    // The Firebase SDK leaves junk around:
    process.exit(0)
  }
}
