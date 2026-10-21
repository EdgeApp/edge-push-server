import { asEither, asNull, asObject, asString } from 'cleaners'
import fetch from 'node-fetch'

import { syncedServices } from '../db/couchSettings'
import { logger } from './logger'

export interface RatesCache {
  getRate: (currencyPair: string, date: Date) => Promise<number | null>
  trimCache: (before: Date) => void
}

const ROUNDING = 5 * 60 * 1000 // 5 minutes

export function makeRatesCache(fetchRate: typeof fetch = fetch): RatesCache {
  // Timestamp -> currency pair -> rate
  const cache = new Map<number, Map<string, number | null>>()

  // Timestamps whose fetch failure we have already logged.
  // A dead rates server used to produce one stack trace per event,
  // which filled the disk; now it produces one warning per time bucket.
  const loggedFailures = new Set<number>()

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
        try {
          rate = await getFromServer(
            fetchRate,
            currencyPair,
            new Date(cacheKey)
          )
        } catch (err) {
          // Treat a failed fetch like a missing rate, and remember that
          // for this time bucket so the other events don't retry it:
          rate = null
          if (!loggedFailures.has(cacheKey)) {
            loggedFailures.add(cacheKey)
            logger.warn({
              msg: 'Rates server fetch failed',
              ratesServer: syncedServices.doc.ratesServer,
              currencyPair,
              date: new Date(cacheKey),
              err
            })
          }
        }
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
      for (const key of toDelete) {
        cache.delete(key)
        loggedFailures.delete(key)
      }
    }
  }
}

async function getFromServer(
  fetchRate: typeof fetch,
  currencyPair: string,
  date: Date
): Promise<number | null> {
  const { ratesServer } = syncedServices.doc
  const response = await fetchRate(
    `${ratesServer}/v2/exchangeRate?currency_pair=${currencyPair}&date=${date.toISOString()}`
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
