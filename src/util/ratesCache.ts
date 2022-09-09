import { asEither, asNull, asObject, asString } from 'cleaners'
import fetch from 'node-fetch'

export interface RatesCache {
  getRate: (currencyPair: string, date: Date) => Promise<number | null>
  trimCache: (before: Date) => void
}

const RATES_SERVER = 'https://rates2.edge.app'
const ROUNDING = 5 * 60 * 1000 // 5 minutes

export function makeRatesCache(): RatesCache {
  // Timestamp -> currency pair -> rate
  const cache = new Map<number, Map<string, number | null>>()

  return {
    async getRate(currencyPair: string, date: Date): Promise<number | null> {
      // Look up the date:
      const cacheKey = roundDate(date)
      let cacheRow = cache.get(cacheKey)
      if (cacheRow == null) {
        cacheRow = new Map()
        cache.set(cacheKey, cacheRow)
      }

      // Look up the rate:
      let rate = cacheRow.get(currencyPair)
      if (rate === undefined) {
        rate = await getFromServer(currencyPair, new Date(cacheKey))
        cacheRow.set(currencyPair, rate)
      }
      return rate
    },

    trimCache(before: Date): void {
      // Store old keys in an array to avoid deleting while iterating:
      const toDelete: number[] = []

      const beforeKey = roundDate(before)
      cache.forEach((_, key) => {
        if (key < beforeKey) toDelete.push(key)
      })
      for (const key of toDelete) cache.delete(key)
    }
  }
}

async function getFromServer(
  currencyPair: string,
  date: Date
): Promise<number | null> {
  const response = await fetch(
    `${RATES_SERVER}/v2/exchangeRate?currency_pair=${currencyPair}&date=${date.toISOString()}`
  )
  const json = await response.json()
  const { exchangeRate } = asRateReply(json)

  if (exchangeRate == null) return null
  return Number(exchangeRate)
}

/**
 * Turns a date into a cache key, using rounding.
 */
function roundDate(date: Date): number {
  return ROUNDING * Math.floor(date.valueOf() / ROUNDING)
}

const asRateReply = asObject({
  currency_pair: asString,
  date: asString,
  exchangeRate: asEither(asString, asNull)
})
