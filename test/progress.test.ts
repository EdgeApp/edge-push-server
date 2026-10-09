import { expect } from 'chai'
import { describe, it } from 'mocha'

import { makeProgressLog, ProgressLog } from '../src/server/marketing/progress'

interface Harness {
  lines: string[]
  log: ProgressLog
  tick: (ms: number) => number
}

/** Collects written lines, with a clock the test drives by hand. */
const setup = (total: number, intervalMs = 30_000): Harness => {
  const lines: string[] = []
  let clock = 0
  const log = makeProgressLog(
    chunk => lines.push(chunk.replace(/\n$/, '')),
    'Queued',
    total,
    { intervalMs, now: () => clock }
  )
  return { lines, log, tick: (ms: number) => (clock += ms) }
}

describe('makeProgressLog', function () {
  it('says nothing before the first interval elapses', function () {
    const { lines, log, tick } = setup(1000)
    log.update(100)
    tick(29_000)
    log.update(500)
    expect(lines).deep.equals([])
  })

  it('reports a percentage once the interval passes', function () {
    const { lines, log, tick } = setup(1000)
    tick(30_000)
    log.update(250)
    expect(lines).lengthOf(1)
    expect(lines[0]).contains('Queued: 25%')
    expect(lines[0]).contains('250 of 1,000')
  })

  it('emits at most one line per interval', function () {
    const { lines, log, tick } = setup(1000)
    tick(30_000)
    log.update(250)
    log.update(300)
    log.update(400)
    expect(lines).lengthOf(1)
    tick(30_000)
    log.update(600)
    expect(lines).lengthOf(2)
    expect(lines[1]).contains('60%')
  })

  it('does not emit a burst after a long stall', function () {
    const { lines, log, tick } = setup(1000)
    // Five intervals pass with no updates at all:
    tick(150_000)
    log.update(900)
    expect(lines).lengthOf(1)
  })

  it('includes a rate and an estimate of the time left', function () {
    const { lines, log, tick } = setup(1000)
    tick(30_000) // 300 done in 30s = 10/s, 700 left = 70s
    log.update(300)
    expect(lines[0]).contains('10/s')
    expect(lines[0]).contains('70s left')
  })

  it('closes with a total and elapsed time, and no estimate', function () {
    const { lines, log, tick } = setup(1000)
    tick(50_000)
    log.finish(1000)
    expect(lines).lengthOf(1)
    expect(lines[0]).contains('100%')
    expect(lines[0]).contains('1,000 of 1,000')
    expect(lines[0]).contains('in 50s')
    expect(lines[0]).does.not.contain('left')
  })

  it('formats long estimates in minutes and hours', function () {
    const a = setup(1_000_000)
    a.tick(30_000) // 10k in 30s = 333/s -> ~2970s left
    a.log.update(10_000)
    expect(a.lines[0]).contains('m left')

    const b = setup(100_000_000)
    b.tick(30_000)
    b.log.update(10_000)
    expect(b.lines[0]).contains('h left')
  })

  it('survives an empty job without dividing by zero', function () {
    const { lines, log } = setup(0)
    log.finish(0)
    expect(lines[0]).contains('100%')
    expect(lines[0]).does.not.contain('NaN')
    expect(lines[0]).does.not.contain('Infinity')
  })
})
