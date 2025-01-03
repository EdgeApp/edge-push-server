import { PushEventRow, streamEvents } from '../db/couchPushEvents'
import { logger } from '../util/logger'
import { DaemonTools, runDaemon } from './runDaemon'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

runDaemon(async tools => {
  const { connections, heartbeat } = tools

  for await (const eventRow of streamEvents(connections, 'price-change')) {
    const { trigger } = eventRow.event
    if (trigger.type !== 'price-change') continue
    const now = new Date()

    try {
      const { currencyPair } = trigger

      // Grab the price:
      const price = await tools.rates.getRate(currencyPair, now)
      if (price == null) continue

      // Check the triggers:
      await checkPriceChange(tools, eventRow, now, price, 'day')
      await checkPriceChange(tools, eventRow, now, price, 'hour')
    } catch (err) {
      const id = eventRow.event.created.toISOString()
      logger.warn({ msg: 'Failed event', id, err })
    }

    heartbeat(`row '${eventRow.id}'`)
  }
})

async function checkPriceChange(
  tools: DaemonTools,
  eventRow: PushEventRow,
  now: Date,
  toPrice: number,
  mode: 'day' | 'hour'
): Promise<void> {
  const { sender } = tools
  const { event } = eventRow
  const { pushMessage, trigger, triggered } = event
  if (trigger.type !== 'price-change') return
  const { currencyPair, directions = [], dailyChange, hourlyChange } = trigger

  // Figure out what we are checking:
  const msBack = mode === 'hour' ? HOUR : DAY
  const triggerPercent = mode === 'hour' ? hourlyChange : dailyChange

  // We either use the time gap, or we use the last trigger time,
  // whichever is later:
  let fromTime = new Date(now.valueOf() - msBack)
  if (triggered instanceof Date && triggered.valueOf() > fromTime.valueOf()) {
    fromTime = triggered
  }

  // Get the historical price:
  const fromPrice = await tools.rates.getRate(currencyPair, fromTime)
  if (fromPrice == null) return

  // Trigger if the change is bigger than our threshold:
  const change = 100 * ((toPrice - fromPrice) / fromPrice)
  if (isNaN(change)) return // Divide by zero
  if (triggerPercent == null || Math.abs(change) < triggerPercent) return

  logger.info({ msg: 'Sending price change', currencyPair, change, event })

  // Figure out out direction string:
  const hourUp = directions[0] ?? 'up'
  const hourDown = directions[1] ?? 'down'
  const dayUp = directions[2] ?? hourUp
  const dayDown = directions[3] ?? hourDown
  const direction =
    mode === 'hour'
      ? change > 0
        ? hourUp
        : hourDown
      : change > 0
      ? dayUp
      : dayDown

  // Performs our string replacements:
  function fixMessage(message?: string): string | undefined {
    if (message == null) return
    return message
      .replace('#direction#', direction)
      .replace('#change#', change.toFixed(2))
      .replace('#to_price#', toPrice.toFixed(2))
  }

  // Send the message:
  if (pushMessage != null) {
    const { body, data, title } = pushMessage
    await sender.sendToEvent(eventRow.event, {
      body: fixMessage(body),
      data,
      title: fixMessage(title),
      isMarketing: false,
      isPriceChange: true
    })
  }

  event.triggered = now
  await eventRow.save()
}
