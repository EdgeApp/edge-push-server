import { asMaybe, asUnknown } from 'cleaners'
import { Command } from 'clipanion'
import { asCouchDoc, viewToStream } from 'edge-server-tools'

import { asCouchDevice } from '../../db/couchDevices'
import { getEventsByDeviceId } from '../../db/couchPushEvents'
import { makeHeartbeat } from '../../util/heartbeat'
import { ServerContext } from '../cliTools'

export class CleanCouch extends Command<ServerContext> {
  static paths = [['clean-couch']]
  static usage = {
    description: 'Scans the device & events databases for errors'
  }

  async execute(): Promise<number> {
    const { connection, stdout } = this.context
    const deviceDb = connection.use('push-devices')
    const heartbeat = makeHeartbeat(stdout)

    for await (const raw of viewToStream(
      async params => await deviceDb.list(params)
    )) {
      const { id } = asCouchDoc(asUnknown)(raw)
      if (isDesign(id)) continue

      const device = asMaybe(asCouchDevice)(raw)
      if (device == null) {
        stdout.write(`Device "${id}" is corrupted\n`)
      }
      try {
        await getEventsByDeviceId(connection, id)
      } catch (error) {
        stdout.write(`Device "${id}" has corrupted events\n`)
      }

      heartbeat(id)
    }

    return 0
  }
}

function isDesign(id: string): boolean {
  return id.startsWith('_design/')
}
