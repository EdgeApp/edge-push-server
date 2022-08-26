import {
  asArray,
  asMaybe,
  asNumber,
  asObject,
  asString,
  Cleaner
} from 'cleaners'
import fetch from 'node-fetch'

import { MiniPlugin } from '../types/miniPlugin'
import { asyncWaterfall } from '../util/asyncWaterfall'
import { memoize } from '../util/memoize'

const serverListInfoUrl = 'https://info1.edge.app/v1/blockBook/'

export const makeBlockbookPlugin = (
  currencyCode: string,
  serverList: string[]
): MiniPlugin => ({
  async broadcastTx(tx: Uint8Array) {
    // https://github.com/trezor/blockbook/blob/master/docs/api.md#send-transaction
    await getBlockbookThing(
      currencyCode,
      'send-tx',
      Buffer.from(tx).toString('hex'),
      serverList,
      asString
    )
  },

  async getBalance(address: string, tokenId?: string) {
    return await getBlockbookThing(
      currencyCode,
      'address',
      address,
      serverList,
      asBlockbookBalance
    )
  },

  async getTxConfirmations(txid: string) {
    return await getBlockbookThing(
      currencyCode,
      'tx',
      txid,
      serverList,
      asBlockbookTxConfirmation
    )
  }
})

const FIVE_MINUTES = 1000 * 60 * 5

const getBlockbookThing = async <T>(
  currencyCode: string,
  path: string,
  thing: string,
  serverList: string[],
  cleaner: Cleaner<T>
): Promise<any> => {
  const urls = await getServerListForCode(currencyCode, serverList)

  return await asyncWaterfall(
    urls.map(url => async () => {
      const response = await fetch(`${url}/api/v2/${path}/${thing}`)
      const json = await response.json()
      return cleaner(json)
    })
  )
}

const updateServerList = memoize(
  async () => {
    const response = await fetch(serverListInfoUrl)
    return asInfo1ServerListResponse(await response.json())
  },
  'list',
  FIVE_MINUTES
)

const getServerListForCode = async (
  code: string,
  hardCodedServerList: string[]
): Promise<string[]> => {
  try {
    const serverList = await updateServerList()
    return serverList[code] ?? hardCodedServerList
  } catch (e) {
    console.log('updateServerList:', e)
    return hardCodedServerList
  }
}

const asInfo1ServerListResponse = asObject(asMaybe(asArray(asString), []))

const asBlockbookBalance = (raw: any): string =>
  asObject({
    balance: asString
  })(raw).balance

const asBlockbookTxConfirmation = (raw: any): number =>
  asObject({
    confirmations: asNumber
  })(raw).confirmations
