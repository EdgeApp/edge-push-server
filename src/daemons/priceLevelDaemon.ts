import { streamEvents } from '../db/couchPushEvents'
import { logger } from '../util/logger'
import { checkEventTrigger } from '../util/triggers'
import { runDaemon } from './runDaemon'

runDaemon(async tools => {
  const { connection, heartbeat } = tools

  for await (const eventRow of streamEvents(connection, 'price-level')) {
    await checkEventTrigger(tools, eventRow).catch(err => {
      const id = eventRow.event.created.toISOString()
      logger.warn({ msg: 'Failed event', id, err })
    })

    heartbeat()
  }
})
