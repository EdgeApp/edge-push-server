import { makePeriodicTask } from 'edge-server-tools'
import nano, { ServerScope } from 'nano'

import { PushEventRow } from '../db/couchPushEvents'
import { setupDatabases } from '../db/couchSetup'
import { serverConfig } from '../serverConfig'
import { MiniPlugin } from '../types/miniPlugin'
import { makeHeartbeat } from '../util/heartbeat'
import { makePushSender, PushSender } from '../util/pushSender'
import { makePlugins } from './miniPlugins/miniPlugins'

export interface DaemonTools {
  connection: ServerScope
  plugins: {
    [pluginId: string]: MiniPlugin
  }

  heartbeat: (item?: string) => void
  triggerEvent: (eventRow: PushEventRow) => Promise<void>
}

export function runDaemon(loop: (tools: DaemonTools) => Promise<void>): void {
  async function main(): Promise<void> {
    const { couchUri } = serverConfig
    const connection = nano(couchUri)
    await setupDatabases(connection)

    const heartbeat = makeHeartbeat(process.stdout)
    const sender = makePushSender(connection)

    const plugins = makePlugins()

    console.log('Starting loop at', new Date())
    await loop({
      connection,
      heartbeat,
      plugins,
      triggerEvent: async event =>
        await triggerEvent(connection, sender, plugins, event, new Date())
    })
    console.log(`Finished loop in ${heartbeat.getSeconds().toFixed(2)}s`)
  }

  console.log('Starting daemon', new Date())
  makePeriodicTask(main, 10 * 60 * 1000, {
    onError(error) {
      console.error(error)
    }
  }).start()
}

/**
 * Handles all the effects once a row has been triggered.
 */
async function triggerEvent(
  connection: ServerScope,
  sender: PushSender,
  plugins: { [id: string]: MiniPlugin },
  eventRow: PushEventRow,
  date: Date,
  stringReplacements: { [key: string]: string }
): Promise<void> {
  const { event } = eventRow
  const { broadcastTxs = [], pushMessage } = event

  if (pushMessage != null) {
    let { tile, body, data } = pushMessage

    for (const replament of stringReplaments) {
      title = title.replace()
      body = body.replace()
    }

    const results = await sender.send(
      connection,
      { title, body, data },
      {
        date,
        deviceId: event.deviceId,
        loginId: event.loginId
      }
    )

    event.pushMessageEmits = results.successCount
    event.pushMessageFails = results.failureCount
  }

  event.broadcastTxErrors = await Promise.all(
    broadcastTxs.map(async tx => {
      try {
        const { pluginId, rawTx } = tx
        const plugin = plugins[pluginId]
        if (plugin == null) return `No pluginId "${pluginId}"`
        await plugin.broadcastTx(rawTx)
        return null
      } catch (error) {
        return String(error)
      }
    })
  )

  event.state = event.recurring ? 'waiting' : 'triggered'
  event.triggered = date
  await eventRow.save()
}
