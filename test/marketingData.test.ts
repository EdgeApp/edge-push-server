import { expect } from 'chai'
import { describe, it } from 'mocha'

import { makeMarketingData } from '../src/server/marketing/marketingData'

// The app's push parser (`parsePushMessage` in edge-react-gui) matches on this
// exact shape, so these pin the contract from the sending side.
describe('makeMarketingData', function () {
  it('marks the push as marketing and carries the campaign id', function () {
    expect(makeMarketingData('abc123')).deep.equals({
      type: 'marketing',
      campaignId: 'abc123'
    })
  })

  it('adds the deep link when one is given', function () {
    expect(makeMarketingData('abc123', 'edge://swap')).deep.equals({
      type: 'marketing',
      campaignId: 'abc123',
      url: 'edge://swap'
    })
  })

  it('omits the url key entirely when there is no link', function () {
    // FCM rejects non-string data values, so `url: undefined` would fail the
    // whole send rather than just skip navigation:
    expect(makeMarketingData('abc123', undefined)).not.has.property('url')
  })
})
