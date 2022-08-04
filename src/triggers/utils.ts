import { add } from 'biggystring'

export const hexToDecimal = (num: string): string => {
  const numberString = num.toLowerCase().startsWith('0x') ? num : `0x${num}`
  return add(numberString, '0', 10)
}

export const snooze = async (ms: number): Promise<void> =>
  await new Promise((resolve: () => void) => setTimeout(resolve, ms))

const ONE_HOUR = 1000 * 60 * 60

export const memoize = <T>(
  func: (...args: any) => Promise<T>,
  key: string,
  timeLimit: number = ONE_HOUR
): ((...args: any) => Promise<T>) => {
  const cache: { [key: string]: T } = {}
  const expiration: { [key: string]: number } = {}
  return async (...args) => {
    try {
      if (expiration[key] == null || expiration[key] < Date.now()) {
        console.log('Updating ' + key + ' cache...')

        const res = await func(...args)
        if (res != null) {
          cache[key] = res
          expiration[key] = Date.now() + timeLimit
        }
      }
    } catch (e) {
      console.log('memoize', key, e)
    }
    return cache[key]
  }
}
