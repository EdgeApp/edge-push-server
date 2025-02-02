import { streamEvents } from '../db/couchPushEvents'
import { logger } from '../util/logger'
import { checkEventTrigger } from '../util/triggers'
import { exponentialBackoff, runDaemon, safeDate } from './runDaemon'

// If something sits in the database longer than this,
// stop checking it altogether:
const ignoreMs = 365 * 24 * 60 * 60 * 1000

// If something sits in the database for more than this amount of time,
// start checking it every other loop:
const throttleMs = 10 * 60 * 1000

runDaemon(async tools => {
  const { connections, heartbeat, iteration } = tools

  // How far in the past should we query?
  const msBack = Math.max(ignoreMs, throttleMs * exponentialBackoff(iteration))

  for await (const eventRow of streamEvents(connections, 'tx-confirm', {
    afterDate: safeDate(Date.now() - msBack)
  })) {
    await checkEventTrigger(tools, eventRow).catch(err => {
      const id = eventRow.event.created.toISOString()
      logger.warn({ msg: 'Failed event', id, err })
    })

    heartbeat()
  }
})
