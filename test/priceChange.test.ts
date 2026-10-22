import { expect } from 'chai'
import { describe, it } from 'mocha'

import { DaemonTools } from '../src/daemons/runDaemon'
import { PushEventRow } from '../src/db/couchPushEvents'
import { PushEvent, PushTriggerState } from '../src/types/pushTypes'
import {
  checkPriceChange,
  priceChangeFromTime,
  priceChangeLookups
} from '../src/util/priceChange'
import { SendableMessage } from '../src/util/pushSender'
import { RateRequest, RatesCache } from '../src/util/ratesCache'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const MINUTE = 60 * 1000

const now = new Date('2026-10-21T23:02:00.000Z')
const dayAgo = new Date(now.valueOf() - DAY)
const hourAgo = new Date(now.valueOf() - HOUR)

function makeEvent(triggered?: PushTriggerState): PushEvent {
  return {
    created: new Date('2026-01-01T00:00:00.000Z'),
    eventId: 'test',
    pushMessage: {
      title: 'BTC is #direction#',
      body: 'Moved #change#% to $#to_price#'
    },
    trigger: {
      type: 'price-change',
      currencyPair: 'BTC_iso:USD',
      dailyChange: 10,
      hourlyChange: 10
    },
    state: 'waiting',
    triggered
  }
}

/**
 * Daemon tools with a rates cache that records what it is asked for,
 * and a sender that records what it sends.
 */
function makeTools(rateFor: (date: Date) => number | null): {
  tools: DaemonTools
  lookups: RateRequest[]
  sent: SendableMessage[]
} {
  const lookups: RateRequest[] = []
  const sent: SendableMessage[] = []
  const rates: RatesCache = {
    async getRate(currencyPair, date) {
      lookups.push({ currencyPair, date })
      return rateFor(date)
    },
    async prefetch() {},
    getStats: () => ({
      requests: 0,
      batches: 0,
      failedBatches: 0,
      nullRates: 0,
      singleFetches: 0
    }),
    trimCache() {}
  }
  const tools: DaemonTools = {
    iteration: 0,
    connections: {} as any,
    heartbeat: () => {},
    plugins: {},
    rates,
    sender: {
      async sendToEvent(event: PushEvent, message: SendableMessage) {
        sent.push(message)
      }
    } as any
  }
  return { tools, lookups, sent }
}

function makeRow(event: PushEvent): PushEventRow & { saves: number } {
  const row = {
    id: event.created.toISOString(),
    event,
    saves: 0,
    async save() {
      ++row.saves
    }
  }
  return row
}

describe('priceChange', function () {
  const cases: Array<{
    name: string
    triggered?: Date
    day: Date
    hour: Date
  }> = [
    { name: 'never triggered', day: dayAgo, hour: hourAgo },
    {
      name: 'triggered more than a day ago',
      triggered: new Date(now.valueOf() - 2 * DAY),
      day: dayAgo,
      hour: hourAgo
    },
    {
      name: 'triggered within the hour',
      triggered: new Date(now.valueOf() - 30 * MINUTE),
      day: new Date(now.valueOf() - 30 * MINUTE),
      hour: new Date(now.valueOf() - 30 * MINUTE)
    },
    {
      name: 'triggered between an hour and a day ago',
      triggered: new Date(now.valueOf() - 5 * HOUR),
      day: new Date(now.valueOf() - 5 * HOUR),
      hour: hourAgo
    }
  ]

  for (const { name, triggered, day, hour } of cases) {
    it(`looks up the same times as checkPriceChange when ${name}`, async function () {
      const event = makeEvent(triggered)
      expect(priceChangeFromTime(now, triggered, 'day')).deep.equals(day)
      expect(priceChangeFromTime(now, triggered, 'hour')).deep.equals(hour)
      expect(priceChangeLookups(event, now)).deep.equals([
        { currencyPair: 'BTC_iso:USD', date: now },
        { currencyPair: 'BTC_iso:USD', date: day },
        { currencyPair: 'BTC_iso:USD', date: hour }
      ])

      // The check asks for exactly the historical times the helper gave:
      const { tools, lookups, sent } = makeTools(() => 100)
      await checkPriceChange(tools, makeRow(event), now, 100, 'day')
      await checkPriceChange(tools, makeRow(event), now, 100, 'hour')
      expect(lookups).deep.equals([
        { currencyPair: 'BTC_iso:USD', date: day },
        { currencyPair: 'BTC_iso:USD', date: hour }
      ])
      expect(sent.length).equals(0)
    })
  }

  it('has no lookups for other trigger types', function () {
    const event: PushEvent = {
      ...makeEvent(),
      trigger: {
        type: 'tx-confirm',
        pluginId: 'bitcoin',
        confirmations: 1,
        txid: 'x'
      }
    }
    expect(priceChangeLookups(event, now)).deep.equals([])
  })

  it('sends when the change crosses the threshold', async function () {
    const { tools, sent } = makeTools(date =>
      date.valueOf() === dayAgo.valueOf() ? 100 : 108
    )
    const row = makeRow(makeEvent())

    // Up 15% over the day, but only 6.5% over the hour:
    // the day check fires and moves `triggered` to now, so the hour
    // check then compares against the price at `now`.
    await checkPriceChange(tools, row, now, 115, 'day')
    await checkPriceChange(tools, row, now, 115, 'hour')
    expect(sent).deep.equals([
      {
        title: 'BTC is up',
        body: 'Moved 15.00% to $115.00',
        data: undefined,
        isMarketing: false,
        isPriceChange: true
      }
    ])
    expect(row.event.triggered).equals(now)
    expect(row.saves).equals(1)
  })

  it('skips a missing historical rate', async function () {
    const { tools, sent } = makeTools(() => null)
    const row = makeRow(makeEvent())
    await checkPriceChange(tools, row, now, 115, 'day')
    expect(sent.length).equals(0)
    expect(row.saves).equals(0)
  })
})
