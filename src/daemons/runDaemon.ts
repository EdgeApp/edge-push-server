import { asMaybe } from 'cleaners'
import cluster from 'cluster'
import { makePeriodicTask } from 'edge-server-tools'
import nano, { ServerScope } from 'nano'

import { asNumberString } from '../cli/cliTools'
import { syncedSettings } from '../db/couchSettings'
import { setupDatabases } from '../db/couchSetup'
import { makePlugins } from '../miniPlugins/miniPlugins'
import { serverConfig } from '../serverConfig'
import { MiniPlugins } from '../types/miniPlugin'
import { makeHeartbeat } from '../util/heartbeat'
import { logger } from '../util/logger'
import { makePushSender, PushSender } from '../util/pushSender'
import { makeRatesCache, RatesCache } from '../util/ratesCache'
import { slackAlert } from '../util/slackAlert'

export interface DaemonTools {
  iteration: number

  connection: ServerScope
  heartbeat: (item?: string) => void
  plugins: MiniPlugins
  rates: RatesCache
  sender: PushSender
}

export function runDaemon(loop: (tools: DaemonTools) => Promise<void>): void {
  const promise = cluster.isPrimary ? manage() : iterate(loop)
  promise.catch(error => {
    logger.error(error)
    process.exit(1)
  })
}

/**
 * Runs the in background, spawning a child processes for each iteration.
 */
async function manage(): Promise<void> {
  logger.info('Starting daemon')

  // Load settings from CouchDB:
  const { couchUri } = serverConfig
  const connection = nano(couchUri)
  await setupDatabases(connection)

  const gapSeconds = 6
  let iteration = 0

  makePeriodicTask(
    async () =>
      await new Promise((resolve, reject) => {
        const { daemonMaxHours } = syncedSettings.doc
        const worker = cluster.fork({ ITERATION: iteration++ })

        const timeout = setTimeout(() => {
          worker.kill()
          const message = `Killed push-server daemon after ${daemonMaxHours} hours`
          logger.warn(message)
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
        logger.error(error)
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

  // Grab our iteration number from the environment:
  const iteration = asMaybe(asNumberString, 0)(process.env.ITERATION)

  const heartbeat = makeHeartbeat({
    write: chunk => {
      const [time, item] = chunk.split(',')
      logger.info({ time, item }, 'heartbeat %s', chunk)
      return true
    }
  })
  const plugins = makePlugins()
  const rates = makeRatesCache()
  const sender = makePushSender(connection)

  logger.info({ msg: 'Starting loop', startTime: new Date() })
  await loop({
    connection,
    heartbeat,
    iteration,
    plugins,
    rates,
    sender
  }).catch(err => logger.warn({ msg: 'Loop crashed', err }))
  logger.info({
    msg: 'Finished loop',
    durationSeconds: heartbeat.getSeconds().toFixed(2)
  })

  // Force-close any lingering stuff:
  process.exit(0)
}

/**
 * Select a period of time to use for a loop iteration.
 *
 * For instance, if a transaction was sent in the past 10 minutes,
 * we should check it every loop. If it has been in the mempool for a
 * few weeks, it probably won't confirm any time soon,
 * so we can check it every few days.
 *
 * If t is our timeout:
 * - Check events younger than t on every loop
 * - Check events younger than 2t on every other loop
 * - Check events younger than 4t every 4 loops
 * - Check events younger than 8t every 8 loops
 * - etc...
 */
export function exponentialBackoff(iteration: number): number {
  let lsb = 0
  while ((iteration & (1 << lsb)) === 0 && lsb < 30) ++lsb
  return 1 << lsb
}

/**
 * Creates a Date object, clamping values to the valid range.
 * According to ECMA262, this is +-100,000,000 days from the epoch.
 */
export function safeDate(timestamp: number): Date {
  return new Date(
    Math.min(8640000000000000, Math.max(-8640000000000000, timestamp))
  )
}
