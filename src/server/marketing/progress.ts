interface ProgressOptions {
  /** How often to emit a line, in milliseconds. */
  intervalMs?: number
  /** Injectable clock, for tests. */
  now?: () => number
}

export interface ProgressLog {
  /** Reports how far along we are, emitting at most once per interval. */
  update: (done: number) => void
  /** Emits a closing line regardless of when the last one went out. */
  finish: (done: number) => void
}

/**
 * Reports progress through a long job on a fixed schedule, rather than once
 * per item. A marketing send walks hundreds of thousands of devices, so the
 * caller needs to know how far along it is and roughly how long is left.
 */
export function makeProgressLog(
  write: (chunk: string) => void,
  label: string,
  total: number,
  options: ProgressOptions = {}
): ProgressLog {
  const { intervalMs = 30_000, now = () => Date.now() } = options

  const start = now()
  let nextAt = intervalMs

  const emit = (done: number, final: boolean): void => {
    const elapsedMs = now() - start
    const percent = total <= 0 ? 100 : Math.floor((100 * done) / total)
    const perSecond = elapsedMs > 0 ? done / (elapsedMs / 1000) : 0

    let line = `  ${label}: ${percent}% — ${commas(done)} of ${commas(total)}`
    if (!final && perSecond > 0) {
      const remaining = (total - done) / perSecond
      line += ` (${commas(Math.round(perSecond))}/s, ~${duration(
        remaining
      )} left)`
    } else if (final) {
      line += ` in ${duration(elapsedMs / 1000)}`
    }
    write(`${line}\n`)
  }

  return {
    update(done: number): void {
      const elapsedMs = now() - start
      if (elapsedMs < nextAt) return
      // Skip whole intervals rather than emitting a burst after a long stall:
      while (nextAt <= elapsedMs) nextAt += intervalMs
      emit(done, false)
    },
    finish(done: number): void {
      emit(done, true)
    }
  }
}

function commas(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function duration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '?'
  if (seconds < 90) return `${Math.round(seconds)}s`
  const minutes = seconds / 60
  if (minutes < 90) return `${Math.round(minutes)}m`
  return `${(minutes / 60).toFixed(1)}h`
}
