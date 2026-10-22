import { gte, lte } from 'biggystring'

import { DaemonTools } from '../daemons/runDaemon'
import { PushEventRow } from '../db/couchPushEvents'
import {
  AddressBalanceTrigger,
  PriceLevelTrigger,
  PushEvent,
  PushTrigger,
  PushTriggerState,
  TxConfirmTrigger
} from '../types/pushTypes'
import { logger } from './logger'
import { RateRequest } from './ratesCache'

interface PushTriggerUpdate {
  done: boolean
  state: PushTriggerState
}

export async function checkEventTrigger(
  tools: DaemonTools,
  eventRow: PushEventRow,
  date: Date = new Date()
): Promise<void> {
  const { plugins, sender } = tools
  const { event } = eventRow
  const { broadcastTxs = [], pushMessage, trigger, triggered } = event

  const update = await checkTrigger(tools, trigger, triggered, date)
  if (update.done) {
    logger.info(`Sending ${trigger.type}`)

    if (pushMessage != null) {
      await sender.sendToEvent(event, {
        ...pushMessage,
        // The `checkTrigger` function never activates price changes:
        isMarketing: false,
        isPriceChange: false
      })
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

    event.state = 'triggered'
    event.triggered = update.state
    await eventRow.save()
  } else if (update.state !== triggered) {
    event.triggered = update.state
    await eventRow.save()
  }
}

/**
 * Every rate `checkEventTrigger` will ask for when it checks
 * this event at `now`, so they can be fetched in one batch first.
 * This walks the trigger tree the same way `checkTrigger` does.
 */
export function priceLevelLookups(event: PushEvent, now: Date): RateRequest[] {
  const out: RateRequest[] = []
  collectPriceLevels(event.trigger, event.triggered, now, out)
  return out
}

function collectPriceLevels(
  trigger: PushTrigger,
  state: PushTriggerState,
  now: Date,
  out: RateRequest[]
): void {
  switch (trigger.type) {
    case 'all':
    case 'any': {
      const states = Array.isArray(state) ? state : []
      trigger.triggers.forEach((child, i) => {
        collectPriceLevels(child, states[i], now, out)
      })
      return
    }

    case 'price-level':
      // Already triggered, so `checkTrigger` won't look at the price:
      if (state instanceof Date) return
      out.push({ currencyPair: trigger.currencyPair, date: now })
  }
}

/**
 * Check the outside world to update a trigger's state.
 */
async function checkTrigger(
  tools: DaemonTools,
  trigger: PushTrigger,
  state: PushTriggerState,
  now: Date
): Promise<PushTriggerUpdate> {
  switch (trigger.type) {
    case 'all': {
      const { triggers } = trigger
      let done = true
      let states = Array.isArray(state) ? state : []

      for (let i = 0; i < triggers.length; ++i) {
        const update = await checkTrigger(tools, triggers[i], states[i], now)
        if (!update.done) done = false
        if (update.state !== states[i]) {
          states = [...states]
          states[i] = update.state
        }
      }
      return { done, state: states }
    }

    case 'any': {
      const { triggers } = trigger
      let done = false
      let states = Array.isArray(state) ? state : []

      for (let i = 0; i < triggers.length; ++i) {
        const update = await checkTrigger(tools, triggers[i], states[i], now)
        if (update.done) done = true
        if (update.state !== states[i]) {
          states = [...states]
          states[i] = update.state
        }
      }
      return { done, state: states }
    }

    // These trigger once, and then remain triggered:
    case 'address-balance':
      if (state instanceof Date) return { done: true, state }
      return (await checkAddressBalance(tools, trigger))
        ? { done: true, state: now }
        : { done: false, state: undefined }

    case 'price-level':
      if (state instanceof Date) return { done: true, state }
      return (await checkPriceLevel(tools, trigger, now))
        ? { done: true, state: now }
        : { done: false, state: undefined }

    case 'tx-confirm':
      if (state instanceof Date) return { done: true, state }
      return (await checkTxConfirm(tools, trigger))
        ? { done: true, state: now }
        : { done: false, state: undefined }

    // This one is recurring, so it is never "done":
    case 'price-change':
      return { done: false, state }
  }
}

async function checkAddressBalance(
  tools: DaemonTools,
  trigger: AddressBalanceTrigger
): Promise<boolean> {
  const { plugins } = tools
  const { aboveAmount, belowAmount, address, pluginId, tokenId } = trigger

  const plugin = plugins[pluginId]
  if (plugin == null) return false

  const balance = await plugin.getBalance(address, tokenId)
  return (
    (aboveAmount != null && gte(balance, aboveAmount)) ||
    (belowAmount != null && lte(balance, belowAmount))
  )
}

async function checkPriceLevel(
  tools: DaemonTools,
  trigger: PriceLevelTrigger,
  now: Date
): Promise<boolean> {
  const { rates } = tools
  const { aboveRate, belowRate, currencyPair } = trigger

  const price = await rates.getRate(currencyPair, now)
  if (price == null) return false

  return (
    (aboveRate != null && price > aboveRate) ||
    (belowRate != null && price < belowRate)
  )
}

async function checkTxConfirm(
  tools: DaemonTools,
  trigger: TxConfirmTrigger
): Promise<boolean> {
  const { plugins } = tools
  const { pluginId, txid } = trigger

  const plugin = plugins[pluginId]
  if (plugin == null) return false

  const confirmations = await plugin.getTxConfirmations(txid)
  return confirmations >= trigger.confirmations
}
