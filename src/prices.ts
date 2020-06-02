import info from './infoServer'

export async function getPriceChange(base: string, quote: string): Promise<number> {
  const today = Date.now()
  const yesterday = today - (1000 * 60 * 60 * 24)

  const todayPrice = await getPrice(base, quote, today)
  const yesterdayPrice = await getPrice(base, quote, yesterday)
  return (todayPrice - yesterdayPrice) / yesterdayPrice
}

export async function getPrice(base: string, quote: string, at: number = Date.now()): Promise<number> {
  const dateString = new Date(at).toISOString()

  try {
    const { exchangeRate } = await info.get(`exchangeRate?currency_pair=${base}_${quote}&date=${dateString}`)
    return parseFloat(exchangeRate)
  } catch (err) {
    console.log(`Cannot fetch prices for ${base}`)
    throw err
  }
}
