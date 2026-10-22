import { expect } from 'chai'
import { describe, it } from 'mocha'
import { RequestInit, Response } from 'node-fetch'

import { logger } from '../src/util/logger'
import {
  BATCH_LIMIT,
  makeRatesCache,
  RateRequest
} from '../src/util/ratesCache'

const inBucket = new Date('2026-10-21T23:02:00.000Z')
const sameBucket = new Date('2026-10-21T23:04:59.000Z')
const nextBucket = new Date('2026-10-21T23:05:00.000Z')
const bucketStart = '2026-10-21T23:00:00.000Z'
const nextBucketStart = '2026-10-21T23:05:00.000Z'

interface FetchCall {
  url: string
  init?: RequestInit
}

function makeFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>
): {
  calls: FetchCall[]
  fetch: any
} {
  const calls: FetchCall[] = []
  return {
    calls,
    fetch: async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return await handler(url, init)
    }
  }
}

function rateReply(exchangeRate: string | null): Response {
  return new Response(
    JSON.stringify({
      currency_pair: 'BTC_iso:USD',
      date: inBucket.toISOString(),
      exchangeRate
    })
  )
}

interface BatchItem {
  currency_pair: string
  date: string
  exchangeRate?: string | null
  error?: string
}

/**
 * Reads the lookups out of a batch request body.
 */
function batchBody(call: FetchCall): BatchItem[] {
  return JSON.parse(String(call.init?.body)).data
}

/**
 * Answers a batch request in order, like the live server does,
 * using `rateFor` to pick each rate.
 */
function echoBatch(
  rateFor: (pair: string, date: string) => string | null = () => '1'
): (url: string, init?: RequestInit) => Promise<Response> {
  return async (url, init) => {
    const { data } = JSON.parse(String(init?.body))
    const items: BatchItem[] = data.map(
      ({ currency_pair: pair, date }: BatchItem) => {
        const exchangeRate = rateFor(pair, date)
        return exchangeRate == null
          ? {
              currency_pair: pair,
              date,
              exchangeRate: null,
              error: `No rate found for ${pair}`
            }
          : { currency_pair: pair, date, exchangeRate }
      }
    )
    return new Response(JSON.stringify({ data: items }))
  }
}

function batchReply(items: BatchItem[]): Response {
  return new Response(JSON.stringify({ data: items }))
}

/**
 * Builds `count` distinct lookups for one date.
 */
function manyRequests(count: number, date: Date): RateRequest[] {
  const out: RateRequest[] = []
  for (let i = 0; i < count; ++i) {
    out.push({ currencyPair: `COIN${i}_iso:USD`, date })
  }
  return out
}

/**
 * Captures `logger.warn` calls for the duration of `body`.
 */
async function captureWarnings(
  body: () => Promise<void>
): Promise<Array<{ [key: string]: unknown }>> {
  const warnings: Array<{ [key: string]: unknown }> = []
  const original = logger.warn
  logger.warn = ((entry: { [key: string]: unknown }) => {
    warnings.push(entry)
  }) as any
  try {
    await body()
  } finally {
    logger.warn = original
  }
  return warnings
}

const noSleep = async (): Promise<void> => {}

describe('ratesCache', function () {
  it('fetches a rate once per 5-minute bucket', async function () {
    const { calls, fetch } = makeFetch(async () => rateReply('84290.5'))
    const rates = makeRatesCache(fetch)

    expect(await rates.getRate('BTC_iso:USD', inBucket)).equals(84290.5)
    expect(await rates.getRate('BTC_iso:USD', sameBucket)).equals(84290.5)
    expect(calls.length).equals(1)
    expect(calls[0].url).includes('date=2026-10-21T23:00:00.000Z')

    expect(await rates.getRate('BTC_iso:USD', nextBucket)).equals(84290.5)
    expect(calls.length).equals(2)
  })

  it('returns null for a missing rate', async function () {
    const { fetch } = makeFetch(async () => rateReply(null))
    const rates = makeRatesCache(fetch)
    expect(await rates.getRate('BTC_iso:USD', inBucket)).equals(null)
  })

  it('treats a failed fetch as a missing rate and does not retry it within the bucket', async function () {
    const { calls, fetch } = makeFetch(async () => {
      throw new Error('connect ECONNREFUSED 144.126.216.163:443')
    })
    const rates = makeRatesCache(fetch)

    expect(await rates.getRate('BTC_iso:USD', inBucket)).equals(null)
    expect(await rates.getRate('BTC_iso:USD', sameBucket)).equals(null)
    expect(calls.length).equals(1)

    // A different pair in the same bucket is a different cache entry:
    expect(await rates.getRate('ETH_iso:USD', sameBucket)).equals(null)
    expect(calls.length).equals(2)

    // The next bucket tries the server again:
    expect(await rates.getRate('BTC_iso:USD', nextBucket)).equals(null)
    expect(calls.length).equals(3)
  })

  it('retries a bucket after trimCache removes it', async function () {
    let fail = true
    const { calls, fetch } = makeFetch(async () => {
      if (fail) throw new Error('connect ECONNREFUSED')
      return rateReply('1')
    })
    const rates = makeRatesCache(fetch)

    expect(await rates.getRate('BTC_iso:USD', inBucket)).equals(null)
    fail = false
    rates.trimCache(nextBucket)
    expect(await rates.getRate('BTC_iso:USD', inBucket)).equals(1)
    expect(calls.length).equals(2)
  })

  it('treats a non-2xx reply as a failed fetch, even with an empty body', async function () {
    // A rate-limited load balancer answers 429 with no body:
    const { calls, fetch } = makeFetch(
      async () => new Response('', { status: 429 })
    )
    const rates = makeRatesCache(fetch)

    expect(await rates.getRate('BTC_iso:USD', inBucket)).equals(null)
    expect(await rates.getRate('BTC_iso:USD', sameBucket)).equals(null)
    expect(calls.length).equals(1)
  })

  describe('prefetch', function () {
    it('posts each (bucket, pair) once, in chunks of at most 100', async function () {
      const { calls, fetch } = makeFetch(echoBatch())
      const rates = makeRatesCache(fetch, noSleep)

      // 250 pairs, each asked for twice within the same bucket:
      const requests = [
        ...manyRequests(250, inBucket),
        ...manyRequests(250, sameBucket)
      ]
      await rates.prefetch(requests)

      expect(calls.length).equals(3)
      expect(calls.map(call => batchBody(call).length)).deep.equals([
        100, 100, 50
      ])
      for (const call of calls) {
        expect(call.url).equals('https://rates2.edge.app/v2/exchangeRates')
        expect(call.init?.method).equals('POST')
        expect(call.init?.headers).deep.equals({
          'Content-Type': 'application/json'
        })
        expect(batchBody(call).length).at.most(BATCH_LIMIT)
        for (const item of batchBody(call)) {
          expect(item.date).equals(bucketStart)
        }
      }
      expect(batchBody(calls[0])[0]).deep.equals({
        currency_pair: 'COIN0_iso:USD',
        date: bucketStart
      })

      // Everything is now cached, so neither path hits the server:
      for (const { currencyPair, date } of requests) {
        expect(await rates.getRate(currencyPair, date)).equals(1)
      }
      await rates.prefetch(requests)
      expect(calls.length).equals(3)
    })

    it('skips keys that are already cached', async function () {
      const { calls, fetch } = makeFetch(async (url, init) => {
        if (init?.method === 'POST') return await echoBatch()(url, init)
        return rateReply('2')
      })
      const rates = makeRatesCache(fetch, noSleep)

      expect(await rates.getRate('BTC_iso:USD', inBucket)).equals(2)
      await rates.prefetch([
        { currencyPair: 'BTC_iso:USD', date: sameBucket },
        { currencyPair: 'ETH_iso:USD', date: sameBucket },
        { currencyPair: 'BTC_iso:USD', date: nextBucket }
      ])

      expect(calls.length).equals(2)
      expect(batchBody(calls[1])).deep.equals([
        { currency_pair: 'ETH_iso:USD', date: bucketStart },
        { currency_pair: 'BTC_iso:USD', date: nextBucketStart }
      ])
      expect(await rates.getRate('BTC_iso:USD', inBucket)).equals(2)
      expect(await rates.getRate('ETH_iso:USD', inBucket)).equals(1)
      expect(await rates.getRate('BTC_iso:USD', nextBucket)).equals(1)
      expect(calls.length).equals(2)
    })

    it('fills the cache from an in-order reply', async function () {
      const { calls, fetch } = makeFetch(
        echoBatch(pair => (pair === 'BTC_iso:USD' ? '84290.5' : '3100.25'))
      )
      const rates = makeRatesCache(fetch, noSleep)

      await rates.prefetch([
        { currencyPair: 'BTC_iso:USD', date: inBucket },
        { currencyPair: 'ETH_iso:USD', date: inBucket }
      ])
      expect(await rates.getRate('BTC_iso:USD', sameBucket)).equals(84290.5)
      expect(await rates.getRate('ETH_iso:USD', sameBucket)).equals(3100.25)
      expect(calls.length).equals(1)
    })

    it('matches a shuffled reply by pair and date', async function () {
      const { calls, fetch } = makeFetch(async () =>
        batchReply([
          // Different order, and a different date format:
          {
            currency_pair: 'BTC_iso:USD',
            date: nextBucketStart,
            exchangeRate: '4'
          },
          {
            currency_pair: 'ETH_iso:USD',
            date: '2026-10-21T23:00:00Z',
            exchangeRate: '2'
          },
          {
            currency_pair: 'BTC_iso:USD',
            date: bucketStart,
            exchangeRate: '1'
          },
          {
            currency_pair: 'ETH_iso:USD',
            date: nextBucketStart,
            exchangeRate: '3'
          }
        ])
      )
      const rates = makeRatesCache(fetch, noSleep)

      await rates.prefetch([
        { currencyPair: 'BTC_iso:USD', date: inBucket },
        { currencyPair: 'ETH_iso:USD', date: inBucket },
        { currencyPair: 'BTC_iso:USD', date: nextBucket },
        { currencyPair: 'ETH_iso:USD', date: nextBucket }
      ])
      expect(await rates.getRate('BTC_iso:USD', inBucket)).equals(1)
      expect(await rates.getRate('ETH_iso:USD', inBucket)).equals(2)
      expect(await rates.getRate('ETH_iso:USD', nextBucket)).equals(3)
      expect(await rates.getRate('BTC_iso:USD', nextBucket)).equals(4)
      expect(calls.length).equals(1)
    })

    it('falls back to position when the reply changes the date', async function () {
      // A server that echoes a date we didn't send still answers in order:
      const { calls, fetch } = makeFetch(async () =>
        batchReply([
          {
            currency_pair: 'BTC_iso:USD',
            date: 'not a date',
            exchangeRate: '1'
          },
          {
            currency_pair: 'ETH_iso:USD',
            date: 'not a date',
            exchangeRate: '2'
          }
        ])
      )
      const rates = makeRatesCache(fetch, noSleep)

      await rates.prefetch([
        { currencyPair: 'BTC_iso:USD', date: inBucket },
        { currencyPair: 'ETH_iso:USD', date: inBucket }
      ])
      expect(await rates.getRate('BTC_iso:USD', inBucket)).equals(1)
      expect(await rates.getRate('ETH_iso:USD', inBucket)).equals(2)
      expect(calls.length).equals(1)
    })

    it('leaves the rest missing after a short reply', async function () {
      const { calls, fetch } = makeFetch(async () =>
        batchReply([
          { currency_pair: 'BTC_iso:USD', date: bucketStart, exchangeRate: '1' }
        ])
      )
      const rates = makeRatesCache(fetch, noSleep)

      await rates.prefetch([
        { currencyPair: 'BTC_iso:USD', date: inBucket },
        { currencyPair: 'ETH_iso:USD', date: inBucket },
        { currencyPair: 'XMR_iso:USD', date: inBucket }
      ])
      expect(await rates.getRate('BTC_iso:USD', inBucket)).equals(1)
      expect(await rates.getRate('ETH_iso:USD', inBucket)).equals(null)
      expect(await rates.getRate('XMR_iso:USD', inBucket)).equals(null)
      expect(calls.length).equals(1)
    })

    it('ignores a reply for something it did not ask for', async function () {
      const { calls, fetch } = makeFetch(async () =>
        batchReply([
          {
            currency_pair: 'XMR_iso:USD',
            date: bucketStart,
            exchangeRate: '9'
          },
          { currency_pair: 'BTC_iso:USD', date: bucketStart, exchangeRate: '1' }
        ])
      )
      const rates = makeRatesCache(fetch, noSleep)

      await rates.prefetch([
        { currencyPair: 'BTC_iso:USD', date: inBucket },
        { currencyPair: 'ETH_iso:USD', date: inBucket }
      ])
      expect(await rates.getRate('BTC_iso:USD', inBucket)).equals(1)
      expect(await rates.getRate('ETH_iso:USD', inBucket)).equals(null)
      expect(calls.length).equals(1)
    })

    it('caches a null exchangeRate as a missing rate', async function () {
      const { calls, fetch } = makeFetch(
        echoBatch(pair => (pair === 'ZZZ_iso:USD' ? null : '1'))
      )
      const rates = makeRatesCache(fetch, noSleep)

      await rates.prefetch([
        { currencyPair: 'BTC_iso:USD', date: inBucket },
        { currencyPair: 'ZZZ_iso:USD', date: inBucket }
      ])
      expect(await rates.getRate('ZZZ_iso:USD', sameBucket)).equals(null)
      expect(await rates.getRate('BTC_iso:USD', sameBucket)).equals(1)
      expect(calls.length).equals(1)
    })

    it('marks every key in a rejected batch missing and logs once per bucket', async function () {
      // A rate-limited load balancer answers 429 with no body:
      const { calls, fetch } = makeFetch(
        async () => new Response('', { status: 429 })
      )
      const rates = makeRatesCache(fetch, noSleep)

      const warnings = await captureWarnings(async () => {
        await rates.prefetch([
          ...manyRequests(150, inBucket),
          { currencyPair: 'BTC_iso:USD', date: nextBucket }
        ])
      })
      expect(calls.length).equals(2)

      // Two batches, two buckets, but the second batch's first bucket
      // was already logged by the first batch:
      expect(warnings.length).equals(2)
      expect(warnings[0]).includes({
        msg: 'Rates server batch failed',
        ratesServer: 'https://rates2.edge.app',
        status: 429,
        pairs: 100
      })
      expect(warnings[0].date).deep.equals(new Date(bucketStart))
      expect(warnings[1]).includes({ status: 429, pairs: 51 })
      expect(warnings[1].date).deep.equals(new Date(nextBucketStart))
      expect(String(warnings[1].err)).includes('HTTP 429')

      // Nothing in those buckets is retried:
      expect(await rates.getRate('COIN0_iso:USD', inBucket)).equals(null)
      expect(await rates.getRate('COIN149_iso:USD', sameBucket)).equals(null)
      expect(await rates.getRate('BTC_iso:USD', nextBucket)).equals(null)
      expect(calls.length).equals(2)

      // Another failure in a logged bucket is quiet:
      const more = await captureWarnings(async () => {
        await rates.prefetch([{ currencyPair: 'ETH_iso:USD', date: inBucket }])
      })
      expect(more.length).equals(0)
      expect(calls.length).equals(3)
    })

    it('treats a network error or bad JSON as a rejected batch', async function () {
      let bad = 'throw'
      const { calls, fetch } = makeFetch(async () => {
        if (bad === 'throw') throw new Error('connect ECONNREFUSED')
        return new Response('<html>502 Bad Gateway</html>')
      })
      const rates = makeRatesCache(fetch, noSleep)

      const warnings = await captureWarnings(async () => {
        await rates.prefetch([{ currencyPair: 'BTC_iso:USD', date: inBucket }])
        bad = 'html'
        await rates.prefetch([
          { currencyPair: 'BTC_iso:USD', date: nextBucket }
        ])
      })
      expect(warnings.length).equals(2)
      expect(warnings[0].status).equals(undefined)
      expect(String(warnings[0].err)).includes('ECONNREFUSED')
      expect(warnings[1].status).equals(200)

      expect(await rates.getRate('BTC_iso:USD', inBucket)).equals(null)
      expect(await rates.getRate('BTC_iso:USD', nextBucket)).equals(null)
      expect(calls.length).equals(2)
    })

    it('sleeps between batches, but not before the first', async function () {
      const sleeps: number[] = []
      const { calls, fetch } = makeFetch(echoBatch())
      const rates = makeRatesCache(fetch, async ms => {
        sleeps.push(ms)
      })

      await rates.prefetch(manyRequests(250, inBucket))
      expect(calls.length).equals(3)
      expect(sleeps.length).equals(2)
      for (const ms of sleeps) {
        expect(ms).greaterThan(0)
        expect(ms).at.most(500)
      }

      // The gap also applies across calls:
      await rates.prefetch(manyRequests(1, nextBucket))
      expect(sleeps.length).equals(3)
    })

    it('counts its work', async function () {
      let fail = false
      const { fetch } = makeFetch(async (url, init) => {
        if (fail) return new Response('', { status: 429 })
        if (init?.method === 'POST') {
          return await echoBatch(pair =>
            pair === 'COIN0_iso:USD' ? null : '1'
          )(url, init)
        }
        return rateReply(null)
      })
      const rates = makeRatesCache(fetch, noSleep)
      expect(rates.getStats()).deep.equals({
        requests: 0,
        batches: 0,
        failedBatches: 0,
        nullRates: 0,
        singleFetches: 0
      })

      await rates.prefetch(manyRequests(150, inBucket))
      fail = true
      await rates.prefetch(manyRequests(10, nextBucket))
      await rates.getRate('BTC_iso:USD', inBucket)
      await rates.getRate('BTC_iso:USD', inBucket)

      expect(rates.getStats()).deep.equals({
        requests: 160,
        batches: 3,
        failedBatches: 1,
        nullRates: 12, // COIN0, the failed batch of 10, and the single fetch
        singleFetches: 1
      })
    })
  })
})
