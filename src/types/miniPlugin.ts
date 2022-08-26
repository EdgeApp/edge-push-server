/**
 * A teeny-tiny currency plugin.
 */
export interface MiniPlugin {
  /**
   * Sends a raw transaction to the network.
   */
  broadcastTx: (tx: Uint8Array) => Promise<void>

  /**
   * Looks up a balance as a native amount.
   */
  getBalance: (address: string, tokenId?: string) => Promise<string>

  /**
   * Looks up a transaction's confirmation status.
   */
  getTxConfirmations: (txid: string) => Promise<number>
}

export interface MiniPlugins {
  [pluginId: string]: MiniPlugin
}
