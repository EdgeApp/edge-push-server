import baseX from 'base-x'

const base58Codec = baseX(
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
)

export const base58 = {
  parse(text: string): Uint8Array {
    return base58Codec.decode(text)
  },
  stringify(data: Uint8Array | number[]): string {
    return base58Codec.encode(data)
  }
}
