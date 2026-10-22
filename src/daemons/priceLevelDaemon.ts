import { streamEvents } from '../db/couchPushEvents'
import { logger } from '../util/logger'
import { pages } from '../util/pages'
import { checkEventTrigger, priceLevelLookups } from '../util/triggers'
import { runDaemon } from './runDaemon'

/**
 * Events per rates prefetch. The first pages fill the cache with the
 * common pairs, so later pages mostly find their rates already there.
 */
const PAGE_SIZE = 500

runDaemon(async tools => {
  const { connections, heartbeat, rates } = tools

  try {
    const stream = streamEvents(connections, 'price-level')
    for await (const page of pages(stream, PAGE_SIZE)) {
      // Fetch every rate this page needs in a few batched requests,
      // so the lookups inside `checkEventTrigger` come from the cache:
      const now = new Date()
      await rates.prefetch(
        page.flatMap(row => priceLevelLookups(row.event, now))
      )

      for (const eventRow of page) {
        await checkEventTrigger(tools, eventRow, now).catch(err => {
          const id = eventRow.event.created.toISOString()
          logger.warn({ msg: 'Failed event', id, err })
        })

        heartbeat()
      }
    }
  } finally {
    logger.info({ msg: 'Rates lookups', ...rates.getStats() })
  }
})
