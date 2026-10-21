import { expect } from 'chai'
import { describe, it } from 'mocha'
import { Response } from 'node-fetch'

import { makeRatesCache } from '../src/util/ratesCache'

const inBucket = new Date('2026-10-21T23:02:00.000Z')
const sameBucket = new Date('2026-10-21T23:04:59.000Z')
const nextBucket = new Date('2026-10-21T23:05:00.000Z')

function makeFetch(handler: (url: string) => Promise<Response>): {
  calls: string[]
  fetch: any
} {
  const calls: string[] = []
  return {
    calls,
    fetch: async (url: string) => {
      calls.push(url)
      return await handler(url)
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

describe('ratesCache', function () {
  it('fetches a rate once per 5-minute bucket', async function () {
    const { calls, fetch } = makeFetch(async () => rateReply('84290.5'))
    const rates = makeRatesCache(fetch)

    expect(await rates.getRate('BTC_iso:USD', inBucket)).equals(84290.5)
    expect(await rates.getRate('BTC_iso:USD', sameBucket)).equals(84290.5)
    expect(calls.length).equals(1)
    expect(calls[0]).includes('date=2026-10-21T23:00:00.000Z')

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
})
