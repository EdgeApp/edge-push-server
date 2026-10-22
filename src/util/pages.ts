/**
 * Groups the items of an async stream into arrays of `size`,
 * so a caller can do something with a whole page before moving on.
 * The last page may be shorter, and an empty stream yields nothing.
 * Items are pulled from the stream only as each page is built,
 * so memory stays at one page.
 */
export async function* pages<T>(
  stream: AsyncIterable<T>,
  size: number
): AsyncIterableIterator<T[]> {
  let page: T[] = []
  for await (const item of stream) {
    page.push(item)
    if (page.length >= size) {
      yield page
      page = []
    }
  }
  if (page.length > 0) yield page
}
