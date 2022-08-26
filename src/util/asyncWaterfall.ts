/* eslint-disable @typescript-eslint/no-floating-promises */

type AsyncFunction<T> = () => Promise<T>

async function snooze(timeout: number): Promise<void> {
  return await new Promise(resolve => setTimeout(resolve, timeout))
}

export async function asyncWaterfall<T>(
  asyncFuncs: Array<AsyncFunction<T>>,
  timeoutMs: number = 5000
): // @ts-expect-error
Promise<T> {
  let pending = asyncFuncs.length
  const promises: Array<Promise<any>> = []
  for (const func of asyncFuncs) {
    const index = promises.length
    promises.push(
      func().catch(e => {
        e.index = index
        throw e
      })
    )
    if (pending > 1) {
      promises.push(
        new Promise(resolve => {
          snooze(timeoutMs).then(() => {
            resolve('async_waterfall_timed_out')
          })
        })
      )
    }
    try {
      const result = await Promise.race(promises)
      if (result === 'async_waterfall_timed_out') {
        promises.pop()
        --pending
      } else {
        return result
      }
    } catch (e) {
      // @ts-expect-error
      const i = e.index
      promises.splice(i, 1)
      promises.pop()
      --pending
      if (pending === 0) {
        throw e
      }
    }
  }
}
