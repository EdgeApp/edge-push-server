import { expect } from 'chai'
import { describe, it } from 'mocha'

import { exponentialBackoff } from '../src/daemons/runDaemon'

describe('runDaemon', function () {
  it('exponentialBackoff', function () {
    const pattern = [2 ** 30, 1, 2, 1, 4, 1, 2, 1, 8]

    for (let i = 0; i < pattern.length; ++i) {
      expect(exponentialBackoff(i)).equals(pattern[i])
    }
  })
})
