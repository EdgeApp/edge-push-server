const ONE_HOUR = 1000 * 60 * 60

export const memoize = <A extends unknown[], R>(
  func: (...args: A) => Promise<R>,
  key: string,
  timeLimit: number = ONE_HOUR
): ((...args: A) => Promise<R>) => {
  const cache: { [key: string]: R } = {}
  const expiration: { [key: string]: number } = {}

  return async (...args) => {
    if (expiration[key] == null || expiration[key] < Date.now()) {
      console.log('Updating ' + key + ' cache...')
      const res = await func(...args)
      cache[key] = res
      expiration[key] = Date.now() + timeLimit
    }
    return cache[key]
  }
}
