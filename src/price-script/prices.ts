import io from '@pm2/io'
import axios from 'axios'
import { asNumber } from 'cleaners'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CONFIG = require('../../serverConfig.json')
const TIMEOUT = 10000 // in milliseconds

const rates = axios.create({
  baseURL: `https://rates1.edge.app/v${CONFIG.ratesServerVersion}/exchangeRate`,
  timeout: TIMEOUT
})

export async function getPriceChange(
  base: string,
  quote: string
): Promise<number> {
  const today = Date.now()
  const yesterday = today - 1000 * 60 * 60 * 24

  const todayPrice = await getPrice(base, quote, today)
  const yesterdayPrice = await getPrice(base, quote, yesterday)
  return (todayPrice - yesterdayPrice) / yesterdayPrice
}

export async function getPrice(
  base: string,
  quote: string,
  at?: number
): Promise<number> {
  let dateString: string = ''
  if (at) {
    dateString = `&date=${new Date(at).toISOString()}`
  }

  try {
    const {
      data: { exchangeRate }
    } = await rates.get(`?currency_pair=${base}_${quote}${dateString}`)
    const rate = asNumber(parseFloat(exchangeRate))
    if (!/^\d+(\.\d+)?/.test(exchangeRate.toString())) {
      throw new Error(`${base}/${quote} rate given was ${exchangeRate}`)
    }
    return rate
  } catch (err: any) {
    // @ts-expect-error
    const lookupDate = new Date(at).toISOString()
    io.notifyError(err, {
      custom: {
        base,
        quote,
        lookupDate
      }
    })
    const reason: string = err.response.data.error
    console.log(`Cannot fetch prices for ${base}/${quote} - ${reason}`)
    throw err
  }
}
