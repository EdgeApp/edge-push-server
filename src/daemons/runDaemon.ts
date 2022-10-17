import cluster from 'cluster'
import { makePeriodicTask } from 'edge-server-tools'
import nano, { ServerScope } from 'nano'

import { syncedSettings } from '../db/couchSettings'
import { setupDatabases } from '../db/couchSetup'
import { makePlugins } from '../miniPlugins/miniPlugins'
import { serverConfig } from '../serverConfig'
import { MiniPlugins } from '../types/miniPlugin'
import { makeHeartbeat } from '../util/heartbeat'
import { makePushSender, PushSender } from '../util/pushSender'
import { makeRatesCache, RatesCache } from '../util/ratesCache'
import { slackAlert } from '../util/slackAlert'

export interface DaemonTools {
  connection: ServerScope
  heartbeat: (item?: string) => void
  plugins: MiniPlugins
  rates: RatesCache
  sender: PushSender
}

export function runDaemon(loop: (tools: DaemonTools) => Promise<void>): void {
  const promise = cluster.isPrimary ? manage() : iterate(loop)
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
        }, daemonMaxHours * 60 * 60 * 1000)

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
async function iterate(
  loop: (tools: DaemonTools) => Promise<void>
): Promise<void> {
  const { couchUri } = serverConfig
  const connection = nano(couchUri)
  await setupDatabases(connection)

  const heartbeat = makeHeartbeat(process.stdout)
  const plugins = makePlugins()
  const rates = makeRatesCache()
  const sender = makePushSender(connection)

  console.log('Starting loop at', new Date())
  await loop({
    connection,
    heartbeat,
    plugins,
    rates,
    sender
  }).catch(error => console.log(`Loop crashed: ${String(error)}`))
  console.log(`Finished loop in ${heartbeat.getSeconds().toFixed(2)}s`)

  // Force-close any lingering stuff:
  process.exit(0)
}
