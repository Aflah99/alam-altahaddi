import { useEffect, useRef } from 'react'
import { FixedStepper } from './physics'

/**
 * requestAnimationFrame loop driving a fixed-timestep simulation.
 * `step` runs at a fixed 60 Hz regardless of display refresh rate; `render`
 * runs once per frame with the interpolation factor between the last two steps.
 * Stops completely while `running` is false; resuming never fast-forwards.
 */
export function useGameLoop(running: boolean, step: () => void, render: (alpha: number) => void) {
  const callbacks = useRef({ step, render })
  useEffect(() => {
    callbacks.current = { step, render }
  })

  useEffect(() => {
    if (!running) return
    const stepper = new FixedStepper()
    let last = performance.now()
    let raf = requestAnimationFrame(function frame(now) {
      const steps = stepper.advance((now - last) / 1000, () => callbacks.current.step())
      last = now
      if (steps >= 0) callbacks.current.render(stepper.alpha())
      raf = requestAnimationFrame(frame)
    })
    // After the tab was hidden, start timing afresh instead of catching up.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        last = performance.now()
        stepper.reset()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [running])
}
