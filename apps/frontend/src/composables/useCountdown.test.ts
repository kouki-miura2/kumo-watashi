import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { effectScope } from 'vue'

import { useCountdown } from './useCountdown.ts'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

test('reports the remaining seconds and label right after starting', () => {
  const scope = effectScope()
  scope.run(() => {
    const { secondsRemaining, remainingLabel, start } = useCountdown()

    start(Date.now() + 90_000)

    expect(secondsRemaining.value).toBe(90)
    expect(remainingLabel.value).toBe('1:30')
  })
  scope.stop()
})

test('ticks down once per second', () => {
  const scope = effectScope()
  scope.run(() => {
    const { secondsRemaining, start } = useCountdown()

    start(Date.now() + 5_000)
    vi.advanceTimersByTime(3_000)

    expect(secondsRemaining.value).toBe(2)
  })
  scope.stop()
})

test('the ratio reflects how much of the original window is left, not just the raw seconds', () => {
  const scope = effectScope()
  scope.run(() => {
    const { remainingRatio, start } = useCountdown()

    start(Date.now() + 180_000, 180_000)
    vi.advanceTimersByTime(90_000)

    expect(remainingRatio.value).toBeCloseTo(50, 0)
  })
  scope.stop()
})

test('stops ticking once it reaches zero', () => {
  const scope = effectScope()
  scope.run(() => {
    const { secondsRemaining, start } = useCountdown()

    start(Date.now() + 2_000)
    vi.advanceTimersByTime(10_000)

    expect(secondsRemaining.value).toBe(0)
  })
  scope.stop()
})

test('starting again re-arms the window instead of stacking timers', () => {
  const scope = effectScope()
  scope.run(() => {
    const { secondsRemaining, start } = useCountdown()

    start(Date.now() + 5_000)
    start(Date.now() + 20_000)
    vi.advanceTimersByTime(1_000)

    expect(secondsRemaining.value).toBe(19)
  })
  scope.stop()
})
