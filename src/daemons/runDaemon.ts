import cluster from 'cluster'
import { makePeriodicTask } from 'edge-server-tools'
import nano, { ServerScope } from 'nano'

import { PushEventRow } from '../db/couchPushEvents'
import { syncedSettings } from '../db/couchSettings'
import { setupDatabases } from '../db/couchSetup'
import { makePlugins } from '../miniPlugins/miniPlugins'
import { serverConfig } from '../serverConfig'
import { MiniPlugins } from '../types/miniPlugin'
import { makeHeartbeat } from '../util/heartbeat'
import { makePushSender, PushSender } from '../util/pushSender'
import { slackAlert } from '../util/slackAlert'

export interface DaemonTools {
  connection: ServerScope
  plugins: MiniPlugins

  heartbeat: (item?: string) => void
  triggerEvent: (
    eventRow: PushEventRow,
    date: Date,
    replacements: { [key: string]: string }
  ) => Promise<void>
}

export function runDaemon(loop: (tools: DaemonTools) => Promise<void>): void {
  const promise = cluster.isPrimary ? manage() : iteration(loop)
  promise.catch(error => {
    console.error(error)
    process.exit(1)
  })
}

/**
 * Runs the in background, spawning a child processes for each iteration.
 */
async function manage(): Promise<void> {
  console.log('Starting daemon', new Date())

  // Load settings from CouchDB:
  const { couchUri } = serverConfig
  const connection = nano(couchUri)
  await setupDatabases(connection)

  const gapSeconds = 6

  makePeriodicTask(
    async () =>
      await new Promise((resolve, reject) => {
        const { daemonMaxHours } = syncedSettings.doc
        const worker = cluster.fork()

        const timeout = setTimeout(() => {
          worker.kill()
          const message = `Killed push-server daemon after ${daemonMaxHours} hours`
          console.log(message)
          slackAlert(message)
        }, daemonMaxHours * 60 * 1000)

        worker.on('exit', () => {
          clearTimeout(timeout)
          resolve()
        })

        worker.on('error', reject)
      }),
    gapSeconds * 1000,
    {
      onError(error) {
        console.error(error)
      }
    }
  ).start()
}

/**
 * Runs the demon callback.
 */
async function iteration(
  loop: (tools: DaemonTools) => Promise<void>
): Promise<void> {
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
    triggerEvent: async (eventRow, date, replacements) =>
      await triggerEvent(
        connection,
        sender,
        plugins,
        eventRow,
        date,
        replacements
      )
  })
  console.log(`Finished loop in ${heartbeat.getSeconds().toFixed(2)}s`)

  // Force-close any lingering stuff:
  process.exit(0)
}

/**
 * Handles all the effects once a row has been triggered.
 */
async function triggerEvent(
  connection: ServerScope,
  sender: PushSender,
  plugins: MiniPlugins,
  eventRow: PushEventRow,
  date: Date,
  replacements: { [key: string]: string }
): Promise<void> {
  const { event } = eventRow
  const { broadcastTxs = [], pushMessage } = event

  console.log(
    `Sending ${event.trigger.type}: ` +
      Object.keys(replacements)
        .map(key => `${key.replace(/%/g, '')}="${replacements[key]}"`)
        .join(', ')
  )

  if (pushMessage != null) {
    let { body, data, title } = pushMessage
    for (const key of Object.keys(replacements)) {
      const value = replacements[key]
      if (title != null) title = title.replace(`#${key}#`, value)
      if (body != null) body = body.replace(`#${key}#`, value)
    }

    const results = await sender.send(
      connection,
      { title, body, data },
      {
        date,
        deviceId: event.deviceId,
        loginId: event.loginId,
        isPriceChange: event.trigger.type === 'price-change'
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

  const recurring = event.trigger.type === 'price-change'
  event.state = recurring ? 'waiting' : 'triggered'
  event.triggered = date
  await eventRow.save()
}
