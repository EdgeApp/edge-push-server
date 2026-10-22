import { expect } from 'chai'
import { describe, it } from 'mocha'

import { pages } from '../src/util/pages'

async function* stream<T>(
  items: T[],
  onPull?: () => void
): AsyncIterableIterator<T> {
  for (const item of items) {
    if (onPull != null) onPull()
    yield item
  }
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const item of iter) out.push(item)
  return out
}

describe('pages', function () {
  it('yields full pages and a short last page', async function () {
    const out = await collect(pages(stream([1, 2, 3, 4, 5, 6, 7]), 3))
    expect(out).deep.equals([[1, 2, 3], [4, 5, 6], [7]])
  })

  it('does not yield an empty last page', async function () {
    const out = await collect(pages(stream([1, 2, 3, 4, 5, 6]), 3))
    expect(out).deep.equals([
      [1, 2, 3],
      [4, 5, 6]
    ])
  })

  it('yields nothing for an empty stream', async function () {
    const out = await collect(pages(stream([]), 3))
    expect(out).deep.equals([])
  })

  it('pulls one page at a time', async function () {
    let pulled = 0
    const iter = pages(
      stream([1, 2, 3, 4, 5], () => ++pulled),
      2
    )
    expect((await iter.next()).value).deep.equals([1, 2])
    expect(pulled).equals(2)
    expect((await iter.next()).value).deep.equals([3, 4])
    expect(pulled).equals(4)
    expect((await iter.next()).value).deep.equals([5])
    expect((await iter.next()).done).equals(true)
  })
})
