import { expect } from 'chai'
import { NextFunction, Request, Response } from 'express'
import { describe, it } from 'mocha'

import {
  asPushBody,
  getPushTarget,
  handleRouterError
} from '../src/server/marketing/marketingTool'

const filter = {
  countryInclude: ['United States'],
  countryExclude: [],
  cityInclude: [],
  cityExclude: [],
  regionInclude: [],
  regionExclude: ['NY']
}

describe('asPushBody', function () {
  it('requires the dryRun flag, so a forgotten flag never sends', function () {
    expect(() => asPushBody({ body: 'hi', deviceId: 'abc' })).throws()
  })

  it('accepts a filter with no countries at all, meaning every country', function () {
    const parsed = asPushBody({
      filter: { countryExclude: ['United States', 'United Kingdom'] },
      dryRun: true
    })
    expect(parsed.filter?.countryInclude).deep.equals([])
    expect(parsed.filter?.countryExclude).deep.equals([
      'United States',
      'United Kingdom'
    ])
  })

  it('accepts a bare dry run of a filter, with no message', function () {
    const parsed = asPushBody({ filter, dryRun: true })
    expect(parsed.filter?.regionExclude).deep.equals(['NY'])
    expect(parsed.title).equals(undefined)
  })
})

describe('getPushTarget', function () {
  const base = { dryRun: true }

  it('recognizes each way of naming the audience', function () {
    expect(getPushTarget(asPushBody({ ...base, deviceId: 'abc' }))).equals(
      'device'
    )
    expect(getPushTarget(asPushBody({ ...base, loginId: 'aGVsbG8=' }))).equals(
      'login'
    )
    expect(getPushTarget(asPushBody({ ...base, deviceIds: ['a'] }))).equals(
      'list'
    )
    expect(getPushTarget(asPushBody({ ...base, filter }))).equals('filter')
  })

  it('refuses a body that names none', function () {
    expect(getPushTarget(asPushBody(base))).equals(undefined)
  })

  it('refuses a body that names two, rather than guessing', function () {
    const both = asPushBody({ ...base, deviceIds: ['a'], filter })
    expect(getPushTarget(both)).equals(undefined)
    const test = asPushBody({ ...base, deviceId: 'abc', loginId: 'aGVsbG8=' })
    expect(getPushTarget(test)).equals(undefined)
  })

  it('treats an empty list as a list, so it can be refused as empty', function () {
    expect(getPushTarget(asPushBody({ ...base, deviceIds: [] }))).equals('list')
  })
})

describe('handleRouterError', function () {
  interface Sent {
    status?: number
    body?: unknown
  }
  function fakeResponse(headersSent = false): { res: Response; sent: Sent } {
    const sent: Sent = {}
    const res: {
      headersSent: boolean
      status: (code: number) => unknown
      json: (body: unknown) => unknown
    } = {
      headersSent,
      status: code => {
        sent.status = code
        return res
      },
      json: body => {
        sent.body = body
        return res
      }
    }
    return { res: res as unknown as Response, sent }
  }
  const req = {} as unknown as Request
  const next: NextFunction = () => undefined

  it('answers a body-parser error with its status and the JSON shape', function () {
    const { res, sent } = fakeResponse()
    const error = Object.assign(new Error('request entity too large'), {
      status: 413
    })
    handleRouterError(error, req, res, next)
    expect(sent).deep.equals({
      status: 413,
      body: { error: 'request entity too large' }
    })
  })

  it('falls back to 500 when the error carries no status', function () {
    const { res, sent } = fakeResponse()
    handleRouterError(new Error('boom'), req, res, next)
    expect(sent).deep.equals({ status: 500, body: { error: 'boom' } })
  })

  it('defers to Express once the headers are out', function () {
    const { res, sent } = fakeResponse(true)
    let passed: unknown
    handleRouterError(new Error('late'), req, res, error => {
      passed = error
    })
    expect(sent).deep.equals({})
    expect(passed).instanceOf(Error)
  })
})
