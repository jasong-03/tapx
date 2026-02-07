"use client"

import { useEffect, useRef } from "react"
import { createScope, animate, stagger } from "animejs"

const COLS = 20
const ROWS = 12

export function NeonGridBackground() {
  const gridRef = useRef<HTMLDivElement>(null)
  const scopeRef = useRef<ReturnType<typeof createScope> | null>(null)

  useEffect(() => {
    if (!gridRef.current) return

    const scope = createScope({ root: gridRef.current })
    scopeRef.current = scope

    // Initial stagger from center
    scope.add(() => {
      animate(".neon-cell", {
        opacity: [0, 0.15],
        scale: [0.5, 1],
        duration: 800,
        delay: stagger(30, { grid: [COLS, ROWS], from: "center" }),
        easing: "easeOutQuad",
      })
    })

    // Breathing loop after initial animation
    const breatheTimer = setTimeout(() => {
      scope.add(() => {
        animate(".neon-cell", {
          opacity: [0.05, 0.25],
          duration: 2000,
          delay: stagger(50, { grid: [COLS, ROWS], from: "random" }),
          loop: true,
          alternate: true,
          easing: "easeInOutSine",
        })
      })
    }, 1200)

    return () => {
      clearTimeout(breatheTimer)
      scope.revert()
    }
  }, [])

  return (
    <div
      ref={gridRef}
      className="absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        }}
      >
        {Array.from({ length: COLS * ROWS }).map((_, i) => (
          <div
            key={i}
            className="neon-cell flex items-center justify-center opacity-0"
          >
            <div className="h-1 w-1 rounded-full bg-neon-pink" />
          </div>
        ))}
      </div>
    </div>
  )
}
