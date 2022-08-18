import {
  asArray,
  asMaybe,
  asNumber,
  asObject,
  asString,
  Cleaner
} from 'cleaners'
import fetch from 'node-fetch'

import { MiniPlugin } from '../../types/miniPlugin'
import { asyncWaterfall } from '../../util/asyncWaterfall'
import { memoize } from '../../util/utils'

const serverListInfoUrl = 'https://info1.edge.app/v1/blockBook/'

const asInfo1ServerListResponse = asObject(asMaybe(asArray(asString), []))

const FIVE_MINUTES = 1000 * 60 * 5

const updateServerList = async (): Promise<{
  [currencyCode: string]: string[]
}> => {
  const response = await fetch(serverListInfoUrl)
  return asInfo1ServerListResponse(await response.json())
}

const getServerListForCode = async (
  code: string,
  hardCodedServerList: string[]
): Promise<string[]> => {
  const serverList = await memoize(updateServerList, 'list', FIVE_MINUTES)()
  return serverList[code] ?? hardCodedServerList ?? []
}
const asBlockbookBalance = (raw: any): string =>
  asObject({
    balance: asString
  })(raw).balance

const asBlockbookTxConfirmation = (raw: any): number =>
  asObject({
    confirmations: asNumber
  })(raw).confirmations

export const makeBlockbookPlugin = (
  currencyCode: string,
  serverList: string[]
): MiniPlugin => {
  const getBlockbookThing = async <T>(
    path: string,
    thing: string,
    cleaner: Cleaner<T>
  ): Promise<T> => {
    // Use fuzzyTimeout or asyncWaterfall:
    const urls = await getServerListForCode(currencyCode, serverList)

    return await asyncWaterfall(
      urls.map(url => async () => {
        const response = await fetch(`${url}/api/v2/${path}/${thing}`)
        const json = await response.json()
        return cleaner(json)
      })
    )
  }

  return {
    async broadcastTx() {
      // TODO!
    },

    async getBalance(address: string, tokenId?: string) {
      return await getBlockbookThing('address', address, asBlockbookBalance)
    },

    async getTxConfirmations(txid: string) {
      return await getBlockbookThing('tx', txid, asBlockbookTxConfirmation)
    }
  }
}
