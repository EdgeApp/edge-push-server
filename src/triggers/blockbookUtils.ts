import {
  asArray,
  asMaybe,
  asNumber,
  asObject,
  asString,
  Cleaner
} from 'cleaners'
import fetch from 'node-fetch'

import { ProviderMethods } from '.'
import { memoize } from './utils'

const serverListInfoUrl = 'https://info1.edge.app/v1/blockBook/'

const asInfo1ServerListResponse = asObject(asMaybe(asArray(asString), []))

const FIVE_MINUTES = 1000 * 60 * 5

const defaultServerLists: { [currencyCode: string]: string[] | null } = {
  BAD: null,
  BTC: [
    'https://btc1.trezor.io',
    'https://btc2.trezor.io',
    'https://btc3.trezor.io',
    'https://btc4.trezor.io',
    'https://btc5.trezor.io',
    'https://bitcoin.atomicwallet.io'
  ],
  BCH: [
    'https://bch1.trezor.io',
    'https://bch2.trezor.io',
    'https://bch3.trezor.io',
    'https://bch4.trezor.io',
    'https://bch5.trezor.io',
    'https://bitcoin-cash-node.atomicwallet.io'
  ],
  BSV: [
    'https://bsv-bbwrap1.edge.app',
    'https://blockbook.siftbitcoin.com:9146'
  ],
  BC1: [
    'https://btc1.trezor.io',
    'https://btc2.trezor.io',
    'https://btc3.trezor.io',
    'https://btc4.trezor.io',
    'https://btc5.trezor.io',
    'https://bitcoin.atomicwallet.io'
  ],
  BTG: [
    'https://btg1.trezor.io',
    'https://btg2.trezor.io',
    'https://btg3.trezor.io',
    'https://btg4.trezor.io',
    'https://btg5.trezor.io',
    'https://bgold.atomicwallet.io'
  ],
  DASH: [
    'https://dash1.trezor.io',
    'https://dash2.trezor.io',
    'https://dash3.trezor.io',
    'https://dash4.trezor.io',
    'https://dash5.trezor.io',
    'https://dash.atomicwallet.io'
  ],
  DGB: [
    'https://dgb1.trezor.io',
    'https://dgb2.trezor.io',
    'https://digibyte.atomicwallet.io'
  ],
  DOGE: [
    'https://doge1.trezor.io',
    'https://doge2.trezor.io',
    'https://doge3.trezor.io',
    'https://doge4.trezor.io',
    'https://doge5.trezor.io',
    'https://dogecoin.atomicwallet.io'
  ],
  EBST: null,
  FTC: ['https://blockbook.feathercoin.com'],
  GRS: ['https://blockbook.groestlcoin.org'],
  LTC: [
    'https://ltc1.trezor.io',
    'https://ltc2.trezor.io',
    'https://ltc3.trezor.io',
    'https://ltc4.trezor.io',
    'https://ltc5.trezor.io',
    'https://litecoin.atomicwallet.io'
  ],
  QTUM: [
    'https://blockbook-qtum-sfo3.edge.app',
    'https://qtum.atomicwallet.io'
  ],
  RVN: [
    'https://blockbook.ravencoin.org',
    'https://blockbook-rvn-sfo3.edge.app',
    'https://ravencoin.atomicwallet.io'
  ],
  SMART: null,
  TBTC: ['https://tbtc1.trezor.io', 'https://tbtc2.trezor.io'],
  TESTBTC: ['https://tbtc1.trezor.io', 'https://tbtc2.trezor.io'],
  UFO: null,
  VTC: [
    'https://vtc1.trezor.io',
    'https://vtc2.trezor.io',
    'https://vtc3.trezor.io',
    'https://vtc4.trezor.io',
    'https://vtc5.trezor.io'
  ],
  ETH: ['https://eth1.trezor.io', 'https://eth2.trezor.io'],
  FIRO: ['https://blockbook.firo.org'],
  ETC: ['https://etc1.trezor.io', 'https://etc2.trezor.io'],
  TELOS: null
}

const updateServerList = async (): Promise<{
  [currencyCode: string]: string[]
}> => {
  const response = await fetch(serverListInfoUrl)
  return asInfo1ServerListResponse(await response.json())
}

const getServerListForCode = async (code: string): Promise<string[]> => {
  const serverList = await memoize(updateServerList, 'list', FIVE_MINUTES)()
  return serverList[code] ?? defaultServerLists[code] ?? []
}
const asBlockbookBalance = (raw: any): string =>
  asObject({
    balance: asString
  })(raw).balance

const asBlockbookTxConfirmation = (raw: any): number =>
  asObject({
    confirmations: asNumber
  })(raw).confirmations

const getBlockbookThing = async <T>(
  currencyCode: string,
  path: string,
  thing: string,
  cleaner: Cleaner<T>
): Promise<any> => {
  const urls = await getServerListForCode(currencyCode)
  const response = await Promise.race(
    urls.map(async url => await fetch(`${url}/api/v2/${path}/${thing}`))
  )

  const json = await response.json()
  return cleaner(json)
}

export const useBlockbook = (currencyCode: string): ProviderMethods => ({
  getBalance: async (address: string) =>
    await getBlockbookThing(
      currencyCode,
      'address',
      address,
      asBlockbookBalance
    ),
  getTxConfirmations: async (txid: string) =>
    await getBlockbookThing(currencyCode, 'tx', txid, asBlockbookTxConfirmation)
})
