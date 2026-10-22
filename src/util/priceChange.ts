import { DaemonTools } from '../daemons/runDaemon'
import { PushEventRow } from '../db/couchPushEvents'
import { PushEvent, PushTriggerState } from '../types/pushTypes'
import { logger } from './logger'
import { RateRequest } from './ratesCache'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export type PriceChangeMode = 'day' | 'hour'

/**
 * The start of the window a price-change check compares against:
 * one hour or one day back, or the last trigger time if that is later.
 */
export function priceChangeFromTime(
  now: Date,
  triggered: PushTriggerState,
  mode: PriceChangeMode
): Date {
  const msBack = mode === 'hour' ? HOUR : DAY

  // We either use the time gap, or we use the last trigger time,
  // whichever is later:
  let fromTime = new Date(now.valueOf() - msBack)
  if (triggered instanceof Date && triggered.valueOf() > fromTime.valueOf()) {
    fromTime = triggered
  }
  return fromTime
}

/**
 * Every rate the price-change daemon will ask for when it checks
 * this event at `now`, so they can be fetched in one batch first.
 */
export function priceChangeLookups(event: PushEvent, now: Date): RateRequest[] {
  const { trigger, triggered } = event
  if (trigger.type !== 'price-change') return []
  const { currencyPair } = trigger

  return [
    { currencyPair, date: now },
    { currencyPair, date: priceChangeFromTime(now, triggered, 'day') },
    { currencyPair, date: priceChangeFromTime(now, triggered, 'hour') }
  ]
}

export async function checkPriceChange(
  tools: DaemonTools,
  eventRow: PushEventRow,
  now: Date,
  toPrice: number,
  mode: PriceChangeMode
): Promise<void> {
  const { sender } = tools
  const { event } = eventRow
  const { pushMessage, trigger, triggered } = event
  if (trigger.type !== 'price-change') return
  const { currencyPair, directions = [], dailyChange, hourlyChange } = trigger

  // Figure out what we are checking:
  const triggerPercent = mode === 'hour' ? hourlyChange : dailyChange
  const fromTime = priceChangeFromTime(now, triggered, mode)

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
