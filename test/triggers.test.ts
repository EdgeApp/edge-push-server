import { expect } from 'chai'
import { describe, it } from 'mocha'

import { DaemonTools } from '../src/daemons/runDaemon'
import { PushEventRow } from '../src/db/couchPushEvents'
import {
  PushEvent,
  PushTrigger,
  PushTriggerState
} from '../src/types/pushTypes'
import { RateRequest, RatesCache } from '../src/util/ratesCache'
import { checkEventTrigger, priceLevelLookups } from '../src/util/triggers'

const now = new Date('2026-10-21T23:02:00.000Z')
const earlier = new Date('2026-10-20T00:00:00.000Z')

function makeEvent(
  trigger: PushTrigger,
  triggered?: PushTriggerState
): PushEvent {
  return {
    created: new Date('2026-01-01T00:00:00.000Z'),
    eventId: 'test',
    trigger,
    state: 'waiting',
    triggered
  }
}

function makeRow(event: PushEvent): PushEventRow {
  return { id: event.created.toISOString(), event, async save() {} }
}

/**
 * Daemon tools with a rates cache that records what it is asked for,
 * and no plugins, so the other trigger types never fire.
 */
function makeTools(): { tools: DaemonTools; lookups: RateRequest[] } {
  const lookups: RateRequest[] = []
  const rates: RatesCache = {
    async getRate(currencyPair, date) {
      lookups.push({ currencyPair, date })
      return 100
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
      async sendToEvent() {
        throw new Error('Nothing should be sent')
      }
    } as any
  }
  return { tools, lookups }
}

const btc: PushTrigger = {
  type: 'price-level',
  currencyPair: 'BTC_iso:USD',
  aboveRate: 1000000
}
const eth: PushTrigger = {
  type: 'price-level',
  currencyPair: 'ETH_iso:USD',
  belowRate: 1
}
const xmr: PushTrigger = {
  type: 'price-level',
  currencyPair: 'XMR_iso:USD',
  belowRate: 1
}
const balance: PushTrigger = {
  type: 'address-balance',
  pluginId: 'bitcoin',
  address: 'x',
  aboveAmount: '1'
}

describe('priceLevelLookups', function () {
  const cases: Array<{
    name: string
    trigger: PushTrigger
    triggered?: PushTriggerState
    expected: string[]
  }> = [
    { name: 'a plain price level', trigger: btc, expected: ['BTC_iso:USD'] },
    {
      name: 'a price level that already fired',
      trigger: btc,
      triggered: earlier,
      expected: []
    },
    { name: 'another trigger type', trigger: balance, expected: [] },
    {
      name: 'nested triggers with partial state',
      trigger: {
        type: 'any',
        triggers: [btc, { type: 'all', triggers: [eth, balance, xmr] }]
      },
      triggered: [undefined, [earlier, undefined, undefined]],
      expected: ['BTC_iso:USD', 'XMR_iso:USD']
    },
    {
      name: 'nested triggers with no state',
      trigger: { type: 'all', triggers: [balance, eth] },
      expected: ['ETH_iso:USD']
    }
  ]

  for (const { name, trigger, triggered, expected } of cases) {
    it(`matches what checkEventTrigger asks for with ${name}`, async function () {
      const event = makeEvent(trigger, triggered)
      const requests = expected.map(currencyPair => ({
        currencyPair,
        date: now
      }))
      expect(priceLevelLookups(event, now)).deep.equals(requests)

      const { tools, lookups } = makeTools()
      await checkEventTrigger(tools, makeRow(event), now)
      expect(lookups).deep.equals(requests)
    })
  }
})
