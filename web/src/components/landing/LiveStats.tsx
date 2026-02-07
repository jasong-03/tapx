"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useInView } from "framer-motion"

interface AnimatedCounterProps {
  target: number
  suffix?: string
  prefix?: string
  label: string
  duration?: number
}

function AnimatedCounter({ target, suffix = "", prefix = "", label, duration = 1.5 }: AnimatedCounterProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!isInView) return

    const start = performance.now()
    const step = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / (duration * 1000), 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(eased * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [isInView, target, duration])

  return (
    <div ref={ref} className="flex flex-col items-center gap-1">
      <span className="text-3xl font-bold tabular-nums sm:text-4xl">
        {prefix}{count.toLocaleString()}{suffix}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}

const stats = [
  { target: 22, suffix: "", label: "Trading Pairs" },
  { target: 1, prefix: "#", label: "On Sui Mainnet" },
  { target: 5, suffix: "x", label: "Max Leverage" },
  { target: 10000, prefix: "$", label: "Demo Balance" },
]

const poweredBy = ["Sui", "DeepBook V3", "Pyth Network"]

export function LiveStats() {
  return (
    <section className="relative py-20 px-4 sm:py-28 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-2 gap-8 sm:grid-cols-4"
        >
          {stats.map((stat) => (
            <AnimatedCounter
              key={stat.label}
              target={stat.target}
              suffix={stat.suffix}
              prefix={stat.prefix}
              label={stat.label}
            />
          ))}
        </motion.div>

        {/* Powered By */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-16 flex flex-col items-center gap-4"
        >
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Powered By</span>
          <div className="flex flex-wrap justify-center gap-3">
            {poweredBy.map((name) => (
              <span
                key={name}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-muted-foreground"
              >
                {name}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
