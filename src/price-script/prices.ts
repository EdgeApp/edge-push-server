import axios from 'axios'
import * as io from '@pm2/io'
import { asNumber } from 'cleaners'

const CONFIG = require('../../config.json')
const TIMEOUT = 10000 // in milliseconds

const rates = axios.create({
  baseURL: `https://rates1.edge.app/v${CONFIG.ratesServerVersion}/exchangeRate`,
  timeout: TIMEOUT
})

export async function getPriceChange(base: string, quote: string): Promise<number> {
  const today = Date.now()
  const yesterday = today - (1000 * 60 * 60 * 24)

  const todayPrice = await getPrice(base, quote, today)
  const yesterdayPrice = await getPrice(base, quote, yesterday)
  return (todayPrice - yesterdayPrice) / yesterdayPrice
}

export async function getPrice(base: string, quote: string, at?: number): Promise<number> {
  let dateString: string = ''
  if (at) {
    dateString = `&date=${new Date(at).toISOString()}`
  }

  try {
    const { data: { exchangeRate } } = await rates.get(`?currency_pair=${base}_${quote}${dateString}`)
    const rate = asNumber(parseFloat(exchangeRate))
    if (!/^\d+(\.\d+)?/.test(exchangeRate.toString())) {
      throw new Error(`${base}/${quote} rate given was ${exchangeRate}`)
    }
    return rate
  } catch (err) {
    const lookupDate = new Date(at).toISOString()
    io.notifyError(err, {
      custom: {
        base,
        quote,
        lookupDate
      }
    })
    console.log(`Cannot fetch prices for ${base}/${quote} - ${err.response.data.error}`)
    throw err
  }
}
