import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  getDeviceSkipReason,
  LocationFilter,
  matchesLocationFilter,
  parseLocationList
} from '../src/server/marketing/locationFilter'
import { Device } from '../src/types/pushTypes'

const emptyFilter: LocationFilter = {
  cityInclude: [],
  cityExclude: [],
  regionInclude: [],
  regionExclude: []
}

const makeFilter = (parts: Partial<LocationFilter>): LocationFilter => ({
  ...emptyFilter,
  ...parts
})

const makeLocation = (city: string, region: string): Device['location'] => ({
  country: 'United States',
  city,
  region
})

const nyc = makeLocation('New York', 'NY')
const buffalo = makeLocation('Buffalo', 'NY')
const sanDiego = makeLocation('San Diego', 'CA')

describe('parseLocationList', function () {
  it('trims, lowercases, and drops blank lines', function () {
    expect(parseLocationList([' New York ', '', '   ', 'BUFFALO'])).deep.equals(
      ['new york', 'buffalo']
    )
  })

  it('removes duplicates', function () {
    expect(parseLocationList(['NY', 'ny', ' Ny '])).deep.equals(['ny'])
  })
})

describe('matchesLocationFilter', function () {
  it('passes everything when no filters are set', function () {
    expect(matchesLocationFilter(nyc, emptyFilter)).equals(true)
  })

  it('rejects devices with no location', function () {
    expect(matchesLocationFilter(undefined, emptyFilter)).equals(false)
  })

  it('treats each include line as an alternative', function () {
    const filter = makeFilter({ cityInclude: ['buffalo', 'san diego'] })
    expect(matchesLocationFilter(buffalo, filter)).equals(true)
    expect(matchesLocationFilter(sanDiego, filter)).equals(true)
    expect(matchesLocationFilter(nyc, filter)).equals(false)
  })

  it('treats each exclude line as an alternative', function () {
    const filter = makeFilter({ cityExclude: ['buffalo', 'san diego'] })
    expect(matchesLocationFilter(buffalo, filter)).equals(false)
    expect(matchesLocationFilter(sanDiego, filter)).equals(false)
    expect(matchesLocationFilter(nyc, filter)).equals(true)
  })

  it('lets an exclude override an include', function () {
    const filter = makeFilter({
      cityInclude: ['new york', 'buffalo'],
      cityExclude: ['buffalo']
    })
    expect(matchesLocationFilter(nyc, filter)).equals(true)
    expect(matchesLocationFilter(buffalo, filter)).equals(false)
  })

  it('ANDs the city and region filters together', function () {
    const filter = makeFilter({
      cityInclude: ['buffalo'],
      regionExclude: ['ny']
    })
    expect(matchesLocationFilter(buffalo, filter)).equals(false)
    expect(matchesLocationFilter(makeLocation('Buffalo', 'WY'), filter)).equals(
      true
    )
  })

  it('matches regions by their stored two-letter code', function () {
    const filter = makeFilter({ regionInclude: ['ny'] })
    expect(matchesLocationFilter(nyc, filter)).equals(true)
    expect(matchesLocationFilter(sanDiego, filter)).equals(false)

    // Region names are not aliased to codes:
    expect(
      matchesLocationFilter(nyc, makeFilter({ regionInclude: ['new york'] }))
    ).equals(false)
  })

  it('ignores case and surrounding whitespace on both sides', function () {
    const filter = makeFilter({ cityExclude: ['new york'] })
    expect(
      matchesLocationFilter(makeLocation('  NEW YORK ', 'NY'), filter)
    ).equals(false)
  })

  it('handles devices with a blank region', function () {
    const blank = makeLocation('Buffalo', '')
    expect(
      matchesLocationFilter(blank, makeFilter({ regionInclude: ['ny'] }))
    ).equals(false)
    expect(
      matchesLocationFilter(blank, makeFilter({ regionExclude: ['ny'] }))
    ).equals(true)
  })

  it('excludes New York from a nationwide send', function () {
    // "United States, exclude New York, empty Region boxes"
    const filter = makeFilter({ cityExclude: ['new york'] })
    expect(matchesLocationFilter(nyc, filter)).equals(false)
    expect(matchesLocationFilter(buffalo, filter)).equals(true)
    expect(matchesLocationFilter(sanDiego, filter)).equals(true)
  })

  it('matches nothing when the city and region filters conflict', function () {
    // "include New York City, Region exclude NY". Devices store the city as
    // "New York", so the include alone already matches nothing.
    const filter = makeFilter({
      cityInclude: ['new york city'],
      regionExclude: ['ny']
    })
    for (const location of [nyc, buffalo, sanDiego]) {
      expect(matchesLocationFilter(location, filter)).equals(false)
    }
  })
})

describe('getDeviceSkipReason', function () {
  const targets = new Set(['edge-app-key', 'white-label-key'])
  const makeDevice = (parts: Partial<Device> = {}): Device => ({
    created: new Date(),
    deviceId: 'device-1',
    apiKey: 'edge-app-key',
    deviceToken: 'valid-token:123',
    ignoreMarketing: false,
    ignorePriceChanges: false,
    loginIds: [],
    visited: new Date(),
    ...parts
  })

  it('accepts a sendable device under any targeted key', function () {
    expect(getDeviceSkipReason(makeDevice(), targets)).equals(undefined)
    expect(
      getDeviceSkipReason(makeDevice({ apiKey: 'white-label-key' }), targets)
    ).equals(undefined)
  })

  it('skips devices that opted out of marketing', function () {
    expect(
      getDeviceSkipReason(makeDevice({ ignoreMarketing: true }), targets)
    ).equals('ignore-marketing')
  })

  it('skips devices outside the targeted API keys', function () {
    expect(
      getDeviceSkipReason(makeDevice({ apiKey: 'other-key' }), targets)
    ).equals('unregistered')
    expect(
      getDeviceSkipReason(makeDevice({ apiKey: undefined }), targets)
    ).equals('unregistered')
    expect(getDeviceSkipReason(makeDevice(), new Set())).equals('unregistered')
  })

  it('skips devices with a missing or blank token', function () {
    expect(
      getDeviceSkipReason(makeDevice({ deviceToken: undefined }), targets)
    ).equals('unregistered')
    expect(
      getDeviceSkipReason(makeDevice({ deviceToken: '   ' }), targets)
    ).equals('unregistered')
  })

  it('skips devices with a malformed token', function () {
    expect(
      getDeviceSkipReason(makeDevice({ deviceToken: 'has spaces' }), targets)
    ).equals('invalid-token')
    expect(
      getDeviceSkipReason(makeDevice({ deviceToken: 'back\\slash' }), targets)
    ).equals('invalid-token')
  })

  it('judges a view summary the same as a whole document', function () {
    // The audience query applies this to `apiKeyLocation` view rows while the
    // send applies it to documents, so both shapes must reach the same answer:
    const cases: Array<Partial<Device>> = [
      {},
      { ignoreMarketing: true },
      { apiKey: 'other-key' },
      { deviceToken: undefined },
      { deviceToken: 'has spaces' }
    ]
    for (const parts of cases) {
      const device = makeDevice(parts)
      const summary = {
        apiKey: device.apiKey,
        deviceToken: device.deviceToken,
        ignoreMarketing: device.ignoreMarketing
      }
      expect(getDeviceSkipReason(summary, targets)).equals(
        getDeviceSkipReason(device, targets)
      )
    }
  })
})
