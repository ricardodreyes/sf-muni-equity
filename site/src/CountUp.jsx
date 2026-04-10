import { useState, useEffect, useRef } from 'react'

export default function CountUp({ end, duration = 1500, decimals = 0, prefix = '', suffix = '', active = true }) {
  const [value, setValue] = useState(0)
  const startTime = useRef(null)
  const raf = useRef(null)

  useEffect(() => {
    if (!active) { setValue(0); return }

    const target = parseFloat(end)
    if (isNaN(target)) { setValue(end); return }

    startTime.current = performance.now()

    function tick(now) {
      const elapsed = now - startTime.current
      const progress = Math.min(elapsed / duration, 1)
      // ease-out-quart
      const eased = 1 - Math.pow(1 - progress, 4)
      setValue(eased * target)

      if (progress < 1) {
        raf.current = requestAnimationFrame(tick)
      } else {
        setValue(target)
      }
    }

    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [end, duration, active])

  const display = typeof end === 'number' || !isNaN(parseFloat(end))
    ? value.toFixed(decimals)
    : end

  return <>{prefix}{display}{suffix}</>
}
