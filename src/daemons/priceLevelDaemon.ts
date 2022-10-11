import { streamEvents } from '../db/couchPushEvents'
import { checkEventTrigger } from '../util/triggers'
import { runDaemon } from './runDaemon'

runDaemon(async tools => {
  const { connection, heartbeat } = tools

  for await (const eventRow of streamEvents(connection, 'price-level')) {
    await checkEventTrigger(tools, eventRow).catch(error => {
      const id = eventRow.event.created.toISOString()
      console.log(`Failed event ${id}: ${String(error)}`)
    })

    heartbeat()
  }
})
