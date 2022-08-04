import { add, sub } from 'biggystring'
import { asNumber, asObject, asString } from 'cleaners'
import { Contract, providers } from 'ethers'
import { base16 } from 'rfc4648'

import { MiniPlugin } from '../../types/miniPlugin'
import { hexToDecimal } from '../../util/utils'

const BALANCE_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function'
  }
]

const getBalanceEvm = async (
  url: string,
  address: string,
  tokenId?: string
): Promise<string> => {
  const provider = new providers.JsonRpcProvider(url)
  if (tokenId == null) {
    const balance = await provider.getBalance('address', 'latest')
    return balance.toString()
  } else {
    const contract = new Contract(tokenId, BALANCE_ABI, provider)
    const balance = await contract.balanceOf(address)
    return balance.toString()
  }
}

const asBlockHeight = asObject({
  number: asNumber
})

const asTransactionStatus = asObject({
  blockNumber: asString // hex
})

const getTxConfirmEvm = async (url: string, txid: string): Promise<number> => {
  const provider = new providers.JsonRpcProvider(url)
  const txidResponse = await provider.send('eth_getTransactionByHash', [txid])
  if (txidResponse == null) return 0
  const txidHeight = hexToDecimal(asTransactionStatus(txidResponse).blockNumber)
  const networkResponse = await provider.getBlock('latest')
  const networkHeight = asBlockHeight(networkResponse).number.toString()

  // The txid has 1 confirmation if the heights are the equal
  const confirmations = add(sub(networkHeight, txidHeight), '1')

  return parseInt(confirmations)
}

export const makeEvmPlugin = (url: string): MiniPlugin => ({
  async broadcastTx(tx) {
    const provider = new providers.JsonRpcProvider(url)
    await provider.sendTransaction('0x' + base16.stringify(tx))
  },

  async getBalance(address: string, tokenId?: string) {
    return await getBalanceEvm(url, address, tokenId)
  },

  async getTxConfirmations(txid: string) {
    return await getTxConfirmEvm(url, txid)
  }
})
