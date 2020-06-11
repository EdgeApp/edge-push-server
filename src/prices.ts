import rates from './ratesServer'

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
    const { exchangeRate } = await rates.get(`exchangeRate?currency_pair=${base}_${quote}${dateString}`)
    return parseFloat(exchangeRate)
  } catch (err) {
    console.log(`Cannot fetch prices for ${base}`)
    throw err
  }
}
