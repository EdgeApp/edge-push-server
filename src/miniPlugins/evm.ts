import { asEither, asNull, asNumber, asObject, asString } from 'cleaners'
import { BigNumber, Contract, providers } from 'ethers'
import { base16 } from 'rfc4648'

import { MiniPlugin } from '../types/miniPlugin'

export const makeEvmPlugin = (url: string): MiniPlugin => ({
  async broadcastTx(tx) {
    const provider = new providers.JsonRpcProvider(url)
    await provider.sendTransaction('0x' + base16.stringify(tx))
  },

  async getBalance(address: string, tokenId?: string) {
    const provider = new providers.JsonRpcProvider(url)
    if (tokenId == null) {
      const balance = await provider.getBalance(address, 'latest')
      return balance.toString()
    } else {
      const contract = new Contract(tokenId, BALANCE_ABI, provider)
      const balance = await contract.balanceOf(address)
      return balance.toString()
    }
  },

  async getTxConfirmations(txid: string) {
    const provider = new providers.JsonRpcProvider(url)

    const txidResponse = await provider.send('eth_getTransactionByHash', [txid])
    if (txidResponse == null) return 0
    const txStatus = asTransactionStatus(txidResponse)
    if (txStatus.blockNumber == null) return 0
    const txidHeight = BigNumber.from(txStatus.blockNumber).toNumber()

    const networkResponse = await provider.getBlock('latest')
    const networkHeight = asBlockHeight(networkResponse).number

    // The txid has 1 confirmation if the heights are the equal
    const confirmations = networkHeight - txidHeight + 1
    return confirmations
  }
})

const BALANCE_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function'
  }
]

const asBlockHeight = asObject({
  number: asNumber
})

const asTransactionStatus = asObject({
  blockNumber: asEither(asString, asNull) // hex
})
