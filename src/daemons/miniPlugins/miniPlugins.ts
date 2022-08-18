import { syncedSettings } from '../../db/couchSettings'
import { MiniPlugin } from '../../types/miniPlugin'
import { makeBlockbookPlugin } from './blockbook'
import { makeEvmPlugin } from './evm'

export function makePlugins(): { [currencyName: string]: MiniPlugin } {
  const plugins = {
    // edge-currency-bitcoin:
    badcoin: makeBlockbookPlugin('BAD', []),
    bitcoin: makeBlockbookPlugin('BTC', [
      'wss://btc1.trezor.io',
      'wss://btc2.trezor.io',
      'wss://btc3.trezor.io',
      'wss://btc4.trezor.io',
      'wss://btc5.trezor.io'
    ]),
    bitcoincash: makeBlockbookPlugin('BCH', [
      'wss://bch1.trezor.io',
      'wss://bch2.trezor.io',
      'wss://bch3.trezor.io',
      'wss://bch4.trezor.io',
      'wss://bch5.trezor.io'
    ]),
    bitcoincashtestnet: makeBlockbookPlugin('TBCH', [
      'https://tbtc1.trezor.io',
      'https://tbtc2.trezor.io'
    ]),
    bitcoingold: makeBlockbookPlugin('BTG', [
      'https://btg1.trezor.io',
      'https://btg2.trezor.io',
      'https://btg3.trezor.io',
      'https://btg4.trezor.io',
      'https://btg5.trezor.io',
      'https://bgold.atomicwallet.io'
    ]),
    // bitcoingoldtestnet:
    bitcoinsv: makeBlockbookPlugin('BSV', [
      'https://bsv-bbwrap1.edge.app',
      'https://blockbook.siftbitcoin.com:9146'
    ]),
    bitcointestnet: makeBlockbookPlugin('TESTBTC', [
      'https://tbtc1.trezor.io',
      'https://tbtc2.trezor.io'
    ]),
    dash: makeBlockbookPlugin('DASH', [
      'https://dash1.trezor.io',
      'https://dash2.trezor.io',
      'https://dash3.trezor.io',
      'https://dash4.trezor.io',
      'https://dash5.trezor.io',
      'https://dash.atomicwallet.io'
    ]),
    digibyte: makeBlockbookPlugin('DGB', [
      'https://dgb1.trezor.io',
      'https://dgb2.trezor.io',
      'https://digibyte.atomicwallet.io'
    ]),
    dogecoin: makeBlockbookPlugin('DOGE', [
      'https://doge1.trezor.io',
      'https://doge2.trezor.io',
      'https://doge3.trezor.io',
      'https://doge4.trezor.io',
      'https://doge5.trezor.io',
      'https://dogecoin.atomicwallet.io'
    ]),
    eboost: makeBlockbookPlugin('EBST', []),
    feathercoin: makeBlockbookPlugin('FTC', [
      'https://blockbook.feathercoin.com'
    ]),
    groestlcoin: makeBlockbookPlugin('GRS', [
      'https://blockbook.groestlcoin.org'
    ]),
    litecoin: makeBlockbookPlugin('LTC', [
      'https://ltc1.trezor.io',
      'https://ltc2.trezor.io',
      'https://ltc3.trezor.io',
      'https://ltc4.trezor.io',
      'https://ltc5.trezor.io',
      'https://litecoin.atomicwallet.io'
    ]),
    qtum: makeBlockbookPlugin('QTUM', [
      'https://blockbook-qtum-sfo3.edge.app',
      'https://qtum.atomicwallet.io'
    ]),
    ravencoin: makeBlockbookPlugin('RVN', [
      'https://blockbook.ravencoin.org',
      'https://blockbook-rvn-sfo3.edge.app',
      'https://ravencoin.atomicwallet.io'
    ]),
    smartcash: makeBlockbookPlugin('SMART', []),
    ufo: makeBlockbookPlugin('UFO', []),
    vertcoin: makeBlockbookPlugin('VTC', [
      'https://vtc1.trezor.io',
      'https://vtc2.trezor.io',
      'https://vtc3.trezor.io',
      'https://vtc4.trezor.io',
      'https://vtc5.trezor.io'
    ]),
    zcoin: makeBlockbookPlugin('FIRO', ['wss://blockbook.firo.org']),

    // edge-currency-accountbased:
    binance: makeEvmPlugin('https://bsc-dataseed1.ninicoin.io'), // not sure
    binancesmartchain: makeEvmPlugin('https://bsc‑dataseed3.binance.org'), // not sure
    hedera: makeEvmPlugin(''), // not sure
    eos: makeEvmPlugin(''), // not sure
    telos: makeEvmPlugin('https://mainnet.telos.net/evm'), // not sure
    wax: makeEvmPlugin('https://wax.greymass.com'), // not sure
    polkadot: makeEvmPlugin('wss://rpc.polkadot.io'), // not sure
    ethereum: makeEvmPlugin(
      `https://mainnet.infura.io/v3/${syncedSettings.doc.infuraProjectId}`
    ),
    kovan: makeEvmPlugin(
      `https://kovan.infura.io/v3/${syncedSettings.doc.infuraProjectId}`
    ),
    ethereumclassic: makeEvmPlugin('https://www.ethercluster.com/etc'),
    fantom: makeEvmPlugin('https://rpc.ftm.tools'),
    fio: makeEvmPlugin(''),
    polygon: makeEvmPlugin('https://polygon-rpc.com/'),
    avalanche: makeEvmPlugin('https://api.avax.network/ext/bc/C/rpc'),
    ripple: makeEvmPlugin(''),
    rsk: makeEvmPlugin('https://public-node.rsk.co'),
    stellar: makeEvmPlugin(''),
    tezos: makeEvmPlugin('https://rpc.tzbeta.net'),
    solana: makeEvmPlugin('https://ssc-dao.genesysgo.net'),
    celo: makeEvmPlugin('https://forno.celo.org')
  }
  return plugins
}
