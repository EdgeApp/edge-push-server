import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  ALLOWED_LINK_KINDS,
  getLinkProblem
} from '../src/server/marketing/marketingLink'

describe('getLinkProblem', function () {
  it('allows the links marketing sends', function () {
    const allowed = [
      'edge://buy',
      'edge://buy/moonpay',
      'edge://buy/moonpay/credit',
      'edge://sell/paybis/sepa',
      'edge://swap',
      'edge://exchange/swap',
      'edge://exchange/swap?buyAsset=monero&sellAsset=bitcoin',
      'edge://exchange/buy?buyAsset=ethereum_0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&promoId=xmr-challenge',
      'edge://exchange/sell?sellAsset=bitcoin',
      'edge://promotion/nexchange',
      'edge://plugin/creditcard',
      'edge://plugin/creditcard/buy/moonpay/credit',
      'edge://plugin/sepa/sell',
      'edge://modal/fundAccount',
      'edge://scene/earnScene',
      'https://deep.edge.app/swap?af=nexchange',
      'https://deep.edge.app/buy/moonpay/credit?af=onezetty',
      'https://deep.edge.app/exchange/swap?af=qaswapgate&buyAsset=monero',
      'https://deep.edge.app/promotion/nexchange'
    ]
    for (const url of allowed) {
      expect(getLinkProblem(url), url).equals(undefined)
    }
  })

  it('refuses links that spend, sign, log in, recover, or leak addresses', function () {
    const refused = [
      'edge://wc?uri=wc%3Aabc',
      'edge://pay/bitcoin/1BoatSLRHtKNngkdXEeobR76b53LETtpyT?amount=1',
      'bitcoin:1BoatSLRHtKNngkdXEeobR76b53LETtpyT?amount=1',
      'edge://https/bitpay.com/i/abc',
      'edge://redirect/payment?baseCurrencyCode=btc&depositWalletAddress=1abc',
      'https://edge.app/redirect/payment?baseCurrencyCode=btc&depositWalletAddress=1abc',
      'edge://edge/lobby123',
      'edge://recovery?token=abc',
      'edge://recovery#abc',
      'edge://reqaddr?codes=BTC&post=https://evil.example',
      'reqaddr://?codes=BTC&redir=https://evil.example',
      'edge://scene/send2?walletId=abc',
      'edge://fiatprovider/buy/simplex',
      'edge://ramp/buy/paybis',
      'https://edge.app/rewards?data=x'
    ]
    for (const url of refused) {
      expect(getLinkProblem(url), url).a('string')
    }
  })

  it('allows any plugin id, but never a query', function () {
    for (const id of [
      'creditcard',
      'bitrefill',
      'moonpay',
      'libertyx',
      'xanpool'
    ]) {
      expect(getLinkProblem(`edge://plugin/${id}`), id).equals(undefined)
    }
    expect(getLinkProblem('edge://plugin/libertyx/some/partner/page')).equals(
      undefined
    )
    expect(
      getLinkProblem('https://deep.edge.app/plugin/bitrefill?af=x')
    ).equals(undefined)
    // The app merges a link's query over the plugin's own baseQuery and hands
    // it to the partner page, api key and referral code included:
    expect(getLinkProblem('edge://plugin/moonpay?apiKey=pk_live_x')).a('string')
    expect(getLinkProblem('edge://plugin/bitrefill?ref=other')).a('string')
    expect(getLinkProblem('edge://plugin/libertyx?address=1abc')).a('string')
    expect(getLinkProblem('edge://plugin')).a('string')
    expect(
      getLinkProblem('edge://plugin/creditcard/buy/moonpay/credit/extra')
    ).a('string')
  })

  it('refuses spellings the app would not follow from a push', function () {
    const refused = [
      'airbitz://buy',
      'https://dp.edge.app/buy',
      'https://dl.edge.app/?af=nexchange',
      'http://deep.edge.app/buy',
      'EDGE://buy',
      'edge://',
      'edge://buy/',
      'edge://swap/',
      'edge://swap?',
      'edge://swap#top',
      'edge://buy/moonpay/credit/extra',
      'edge://exchange',
      'edge://exchange/transfer',
      'edge://exchange/swap?buyAsset=',
      'edge://exchange/swap?buyAsset=a&buyAsset=b',
      'edge://exchange/swap?buyAsset=a%20b',
      'edge://exchange/swap?buyAsset=a?b',
      'edge://buy?foo=bar',
      'edge://promotion',
      'edge://promotion/a/b',
      'edge://modal/test',
      'edge://scene/earnScene?x=1',
      'edge://scene/walletList',
      'edge://' + 'x'.repeat(2000)
    ]
    for (const url of refused) {
      expect(getLinkProblem(url), url).a('string')
    }
  })

  it('refuses dot segments, which a WHATWG parser would collapse into another kind', function () {
    const traversals = [
      'https://deep.edge.app/buy/../pay/bitcoin/1abc?af=x',
      'https://deep.edge.app/plugin/../edge/lobby?af=x',
      'https://deep.edge.app/plugin/../scene/send2?af=x',
      'edge://buy/../recovery',
      'edge://plugin/x/./y',
      'edge://plugin/..',
      'edge://buy/.'
    ]
    for (const url of traversals) {
      expect(getLinkProblem(url), url).contains('"."')
    }
  })

  it('refuses af on the edge:// form, which the app drops silently', function () {
    const problem = getLinkProblem('edge://swap?af=nexchange')
    expect(problem).contains('https://deep.edge.app/')
    expect(getLinkProblem('https://deep.edge.app/swap?af=nexchange')).equals(
      undefined
    )
  })

  it('names the allowed kinds when it refuses an unknown one', function () {
    const problem = getLinkProblem('edge://wc?uri=x')
    expect(problem).contains('"wc"')
    expect(problem).contains(ALLOWED_LINK_KINDS)
  })
})
