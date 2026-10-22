import {
  asArray,
  asEither,
  asMaybe,
  asNull,
  asObject,
  asOptional,
  asString
} from 'cleaners'
import fetch from 'node-fetch'

import { syncedServices } from '../db/couchSettings'
import { logger } from './logger'

/**
 * A rate a daemon is about to ask for, so the cache can fetch it
 * in a batch ahead of time.
 */
export interface RateRequest {
  currencyPair: string
  date: Date
}

/**
 * What the cache has done so far, for the end-of-loop log line.
 */
export interface RatesStats {
  /** Lookups sent to the server in batches, after de-duplication. */
  requests: number
  /** Batch requests made (`POST /v2/exchangeRates`). */
  batches: number
  /** Batches that returned no usable reply. */
  failedBatches: number
  /** Lookups cached as missing, whether the server said so or failed. */
  nullRates: number
  /** Single-rate requests (`GET /v2/exchangeRate`), the safety net. */
  singleFetches: number
}

export interface RatesCache {
  getRate: (currencyPair: string, date: Date) => Promise<number | null>
  prefetch: (requests: RateRequest[]) => Promise<void>
  getStats: () => RatesStats
  trimCache: (before: Date) => void
}

const ROUNDING = 5 * 60 * 1000 // 5 minutes

/**
 * The most lookups the rates server accepts in one batch.
 */
export const BATCH_LIMIT = 100

/**
 * The shortest gap between two batch requests. Two requests a second
 * keeps a loop well inside the rates load balancer's limit of
 * 300 requests per 100 seconds, and a loop only needs a few dozen.
 */
const BATCH_GAP_MS = 500

/**
 * A cache slot: a 5-minute bucket plus a currency pair.
 */
interface RateKey {
  cacheKey: number
  currencyPair: string
}

export function makeRatesCache(
  fetchRate: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = defaultSleep
): RatesCache {
  // Timestamp -> currency pair -> rate
  const cache = new Map<number, Map<string, number | null>>()

  // Timestamps whose fetch failure we have already logged.
  // A dead rates server used to produce one stack trace per event,
  // which filled the disk; now it produces one warning per time bucket.
  const loggedFailures = new Set<number>()

  const stats: RatesStats = {
    requests: 0,
    batches: 0,
    failedBatches: 0,
    nullRates: 0,
    singleFetches: 0
  }

  // When the last batch request went out, for pacing:
  let lastBatchTime = -Infinity

  function getCacheRow(cacheKey: number): Map<string, number | null> {
    let cacheRow = cache.get(cacheKey)
    if (cacheRow == null) {
      cacheRow = new Map()
      cache.set(cacheKey, cacheRow)
    }
    return cacheRow
  }

  function setRate(key: RateKey, rate: number | null): void {
    getCacheRow(key.cacheKey).set(key.currencyPair, rate)
    if (rate == null) ++stats.nullRates
  }

  /**
   * Fetches one batch of at most `BATCH_LIMIT` keys and caches the
   * answers, or caches `null` for every key if the batch fails.
   */
  async function fetchBatch(chunk: RateKey[]): Promise<void> {
    const { ratesServer } = syncedServices.doc
    ++stats.batches
    stats.requests += chunk.length

    let status: number | undefined
    let items: Array<BatchItem | undefined>
    try {
      const response = await fetchRate(`${ratesServer}/v2/exchangeRates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: chunk.map(({ cacheKey, currencyPair }) => ({
            currency_pair: currencyPair,
            date: new Date(cacheKey).toISOString()
          }))
        })
      })
      status = response.status
      if (!response.ok) {
        // The body says why, when there is one (a 429 has none):
        const body = await response.text().catch(() => '')
        throw new Error(
          `HTTP ${response.status} from ${ratesServer} ${body.slice(0, 200)}`
        )
      }
      items = asBatchReply(await response.json()).data
    } catch (err) {
      // Treat the whole batch like missing rates, and remember that
      // so the per-event lookups don't retry them one by one:
      ++stats.failedBatches
      for (const key of chunk) setRate(key, null)

      // Log once per time bucket, like the single fetch does. A batch
      // mostly covers one bucket, so this is one line per failure:
      const unlogged = chunk
        .map(key => key.cacheKey)
        .filter((cacheKey, i, keys) => keys.indexOf(cacheKey) === i)
        .filter(cacheKey => !loggedFailures.has(cacheKey))
      if (unlogged.length > 0) {
        for (const cacheKey of unlogged) loggedFailures.add(cacheKey)
        logger.warn({
          msg: 'Rates server batch failed',
          ratesServer,
          status,
          pairs: chunk.length,
          // A batch is rejected whole if this is in the server's future:
          date: new Date(Math.max(...unlogged)),
          err
        })
      }
      return
    }

    // The server answers in request order, but that is not documented,
    // so match each reply by (pair, date) first, and fall back to its
    // position when at least the pair agrees:
    const pending = new Map<string, RateKey>()
    for (const key of chunk) pending.set(pendingKey(key), key)
    items.forEach((item, i) => {
      if (item == null) return
      const byKey = pending.get(
        pendingKey({
          cacheKey: Date.parse(item.date),
          currencyPair: item.currency_pair
        })
      )
      const byPosition =
        i < chunk.length && chunk[i].currencyPair === item.currency_pair
          ? pending.get(pendingKey(chunk[i]))
          : undefined
      const key = byKey ?? byPosition
      if (key == null) return
      pending.delete(pendingKey(key))
      setRate(key, item.exchangeRate == null ? null : Number(item.exchangeRate))
    })

    // Anything the server didn't answer is missing:
    pending.forEach(key => setRate(key, null))
  }

  return {
    async getRate(currencyPair: string, date: Date): Promise<number | null> {
      // Look up the date:
      const cacheKey = roundDate(date)
      const cacheRow = getCacheRow(cacheKey)

      // Look up the rate:
      let rate = cacheRow.get(currencyPair)
      if (rate === undefined) {
        ++stats.singleFetches
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
        setRate({ cacheKey, currencyPair }, rate)
      }
      return rate
    },

    async prefetch(requests: RateRequest[]): Promise<void> {
      // Find the keys we don't have yet, grouped by time bucket so
      // each batch mostly covers one timestamp:
      const missing = new Map<number, Set<string>>()
      for (const { currencyPair, date } of requests) {
        const cacheKey = roundDate(date)
        if (getCacheRow(cacheKey).has(currencyPair)) continue
        let pairs = missing.get(cacheKey)
        if (pairs == null) {
          pairs = new Set()
          missing.set(cacheKey, pairs)
        }
        pairs.add(currencyPair)
      }
      const keys: RateKey[] = []
      missing.forEach((pairs, cacheKey) => {
        pairs.forEach(currencyPair => keys.push({ cacheKey, currencyPair }))
      })

      for (let i = 0; i < keys.length; i += BATCH_LIMIT) {
        // Pace the requests:
        const wait = BATCH_GAP_MS - (Date.now() - lastBatchTime)
        if (wait > 0) await sleep(wait)
        lastBatchTime = Date.now()

        await fetchBatch(keys.slice(i, i + BATCH_LIMIT))
      }
    },

    getStats(): RatesStats {
      return { ...stats }
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
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${ratesServer}`)
  }
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

function pendingKey(key: RateKey): string {
  return `${key.cacheKey} ${key.currencyPair}`
}

async function defaultSleep(ms: number): Promise<void> {
  return await new Promise(resolve => setTimeout(resolve, ms))
}

const asRateReply = asObject({
  currency_pair: asString,
  date: asString,
  exchangeRate: asEither(asString, asNull)
})

const asBatchItem = asObject({
  currency_pair: asString,
  date: asString,
  exchangeRate: asOptional(asEither(asString, asNull))
})
type BatchItem = ReturnType<typeof asBatchItem>

/**
 * A malformed item becomes `undefined` and its slot is left missing,
 * rather than failing the whole batch.
 */
const asBatchReply = asObject({
  data: asArray(asMaybe(asBatchItem))
})
