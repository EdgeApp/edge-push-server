import { asEither, asNull, asObject, asString } from 'cleaners'
import fetch from 'node-fetch'

import { streamPriceEvents } from '../db/couchPushEvents'
import { asPriceLevelTrigger } from '../types/pushCleaners'
import { PushTrigger } from '../types/pushTypes'
import { triggerChecker } from '.'

const UPDATE_MS = 30 * 1000 // 30 seconds

// TODO: could this grow unchecked?
const priceCache: {
  [currencyPair: string]: { price: string; updated: Date }
} = {}

const getPrice = async (currencyPair: string): Promise<number> => {
  if (
    priceCache[currencyPair] == null ||
    priceCache[currencyPair].updated < new Date(Date.now() - UPDATE_MS)
  ) {
    // Fetch the price and update the cache
    const response = await fetch(
      `https://rates2.edge.app/v2/exchangeRate?currency_pair=${currencyPair}`
    )
    const json = await response.json()
    const rate = asObject({
      currency_pair: asString,
      date: asString,
      exchangeRate: asEither(asString, asNull)
    })(json)
    if (rate.exchangeRate == null)
      throw new Error(`Failed to get price for ${currencyPair} at ${rate.date}`)

    priceCache[currencyPair] = {
      price: rate.exchangeRate,
      updated: new Date()
    }
  }

  if (priceCache[currencyPair] == null)
    throw new Error(`Error retrieving price for ${currencyPair}`)
  return Number(priceCache[currencyPair].price)
}

const priceChecker = async (trigger: PushTrigger): Promise<boolean> => {
  const { currencyPair, aboveRate, belowRate } = asPriceLevelTrigger(trigger)

  const price = await getPrice(currencyPair)

  return (
    (aboveRate != null && belowRate != null) ||
    (aboveRate != null && price > aboveRate) ||
    (belowRate != null && price < belowRate)
  )
}

export const priceLevelTrigger = async (): Promise<void> =>
  await triggerChecker(streamPriceEvents, 'price-level', priceChecker)
