import { PushEventRow, streamPriceEvents } from '../db/couchPushEvents'
import { PriceChangeTrigger, PriceLevelTrigger } from '../types/pushTypes'
import { makeRatesCache } from '../util/ratesCache'
import { DaemonTools, runDaemon } from './runDaemon'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const rateCache = makeRatesCache()

runDaemon(async tools => {
  const { connection, heartbeat } = tools

  const yesterday = new Date(Date.now() - DAY)
  rateCache.trimCache(yesterday)

  for await (const eventRow of streamPriceEvents(connection)) {
    const { trigger } = eventRow.event

    try {
      if (trigger.type === 'price-change') {
        await handleChangeEvent(tools, eventRow, trigger)
      } else if (trigger.type === 'price-level') {
        await handleLevelEvent(tools, eventRow, trigger)
      }
    } catch (error) {
      const id = eventRow.event.created.toISOString()
      console.log(`Failed event ${id}: ${String(error)}`)
    }

    heartbeat()
  }
})

async function handleChangeEvent(
  tools: DaemonTools,
  eventRow: PushEventRow,
  trigger: PriceChangeTrigger
): Promise<void> {
  const { triggered } = eventRow.event
  const { currencyPair, directions = [], dailyChange, hourlyChange } = trigger
  const now = new Date()

  // Common logic:
  async function triggerPriceChangeEvent(
    triggerPercent: number,
    msBack: number
  ): Promise<void> {
    const fromTime = new Date(now.valueOf() - msBack)

    // We either use the time gap, or we use the last trigger time,
    // whichever is later:
    const fromPrice = await rateCache.getRate(
      currencyPair,
      triggered == null || triggered.valueOf() < fromTime.valueOf()
        ? fromTime
        : triggered
    )
    if (price == null || fromPrice == null) return

    // Trigger if the change is bigger than our threshold:
    const change = 100 * ((price - fromPrice) / fromPrice)
    if (Math.abs(change) >= triggerPercent) {
      const hourUp = directions[0] ?? 'up'
      const hourDown = directions[1] ?? 'down'
      const dayUp = directions[2] ?? hourUp
      const dayDown = directions[3] ?? hourDown
      await tools.triggerEvent(eventRow, now, {
        direction:
          msBack === HOUR
            ? change > 0
              ? hourUp
              : hourDown
            : change > 0
            ? dayUp
            : dayDown,
        change: change.toFixed(2),
        to_price: price.toFixed(2)
      })
    }
  }

  // Grab the price:
  const price = await rateCache.getRate(currencyPair, now)

  // Check the triggers:
  if (dailyChange != null) {
    await triggerPriceChangeEvent(dailyChange, DAY)
  }
  if (hourlyChange != null) {
    await triggerPriceChangeEvent(hourlyChange, HOUR)
  }
}

async function handleLevelEvent(
  tools: DaemonTools,
  eventRow: PushEventRow,
  trigger: PriceLevelTrigger
): Promise<void> {
  const { aboveRate, belowRate, currencyPair } = trigger
  const now = new Date()

  // Grab the price:
  const price = await rateCache.getRate(currencyPair, now)
  if (price == null) return

  // Check the triggers:
  if (
    (aboveRate != null && price > aboveRate) ||
    (belowRate != null && price < belowRate)
  ) {
    await tools.triggerEvent(eventRow, now, {
      price: price.toFixed(2)
    })
  }
}
