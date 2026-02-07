"use client"

import { motion } from "framer-motion"

interface SmileFaceProps {
  size: number
  color: string
  bgColor: string
  label?: string
  eyeStyle?: "dots" | "dash" | "wide" | "cross"
  mouthStyle?: "smile" | "flat" | "open"
}

function SmileFace({ size, color, bgColor, label, eyeStyle = "dots", mouthStyle = "smile" }: SmileFaceProps) {
  const r = size * 0.12 // corner radius

  const renderEyes = () => {
    const y = size * 0.35
    const lx = size * 0.32
    const rx = size * 0.68

    switch (eyeStyle) {
      case "dash":
        return (
          <>
            <line x1={lx - 4} y1={y} x2={lx + 4} y2={y} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
            <line x1={rx - 4} y1={y} x2={rx + 4} y2={y} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
          </>
        )
      case "wide":
        return (
          <>
            <circle cx={lx} cy={y} r={size * 0.07} fill={color} />
            <circle cx={rx} cy={y} r={size * 0.07} fill={color} />
          </>
        )
      case "cross":
        return (
          <>
            <line x1={lx - 3} y1={y - 3} x2={lx + 3} y2={y + 3} stroke={color} strokeWidth={2} strokeLinecap="round" />
            <line x1={lx + 3} y1={y - 3} x2={lx - 3} y2={y + 3} stroke={color} strokeWidth={2} strokeLinecap="round" />
            <line x1={rx - 3} y1={y - 3} x2={rx + 3} y2={y + 3} stroke={color} strokeWidth={2} strokeLinecap="round" />
            <line x1={rx + 3} y1={y - 3} x2={rx - 3} y2={y + 3} stroke={color} strokeWidth={2} strokeLinecap="round" />
          </>
        )
      default: // dots
        return (
          <>
            <circle cx={lx} cy={y} r={size * 0.05} fill={color} />
            <circle cx={rx} cy={y} r={size * 0.05} fill={color} />
          </>
        )
    }
  }

  const renderMouth = () => {
    const y = size * 0.6
    const cx = size * 0.5

    switch (mouthStyle) {
      case "flat":
        return <line x1={cx - size * 0.12} y1={y} x2={cx + size * 0.12} y2={y} stroke={color} strokeWidth={2} strokeLinecap="round" />
      case "open":
        return <circle cx={cx} cy={y + 2} r={size * 0.08} fill={color} />
      default: // smile
        return (
          <path
            d={`M ${cx - size * 0.14} ${y} Q ${cx} ${y + size * 0.14} ${cx + size * 0.14} ${y}`}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        )
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <rect x={1} y={1} width={size - 2} height={size - 2} rx={r} fill={bgColor} />
        {renderEyes()}
        {renderMouth()}
      </svg>
      {label && (
        <span className="text-[10px] tracking-wider text-white/30 font-mono">{label}</span>
      )}
    </div>
  )
}

const faces = [
  // Left side
  { x: "5%",  y: "8%",   size: 44, color: "#1a1a1a", bg: "oklch(0.7 0.25 330)",  label: "trader",  eye: "dots"  as const, mouth: "smile" as const, delay: 0.3 },
  { x: "3%",  y: "35%",  size: 36, color: "#1a1a1a", bg: "oklch(0.85 0.25 130)", label: "degen",   eye: "dash"  as const, mouth: "flat"  as const, delay: 0.8 },
  { x: "8%",  y: "55%",  size: 50, color: "#1a1a1a", bg: "oklch(0.5 0.2 290)",   label: "whale",   eye: "wide"  as const, mouth: "open"  as const, delay: 1.2 },
  { x: "2%",  y: "78%",  size: 40, color: "#1a1a1a", bg: "oklch(0.9 0.2 95)",    label: "hodler",  eye: "cross" as const, mouth: "smile" as const, delay: 0.5 },
  { x: "12%", y: "22%",  size: 32, color: "#1a1a1a", bg: "oklch(0.6 0.3 320)",   eye: "dots"  as const, mouth: "flat"  as const, delay: 1.5 },

  // Right side
  { x: "88%", y: "12%",  size: 48, color: "#1a1a1a", bg: "oklch(0.7 0.25 330)",  label: "sui",     eye: "wide"  as const, mouth: "smile" as const, delay: 0.6 },
  { x: "92%", y: "40%",  size: 38, color: "#1a1a1a", bg: "oklch(0.85 0.25 130)", label: "ape",     eye: "dots"  as const, mouth: "open"  as const, delay: 1.0 },
  { x: "85%", y: "62%",  size: 52, color: "#1a1a1a", bg: "oklch(0.9 0.2 95)",    label: "moon",    eye: "dash"  as const, mouth: "smile" as const, delay: 0.4 },
  { x: "90%", y: "85%",  size: 34, color: "#1a1a1a", bg: "oklch(0.5 0.2 290)",   label: "flipper", eye: "cross" as const, mouth: "flat"  as const, delay: 1.3 },
  { x: "82%", y: "28%",  size: 30, color: "#1a1a1a", bg: "oklch(0.6 0.3 320)",   eye: "dots"  as const, mouth: "smile" as const, delay: 0.9 },

  // Extra scattered
  { x: "15%", y: "90%",  size: 42, color: "#1a1a1a", bg: "oklch(0.7 0.25 330)",  eye: "wide" as const, mouth: "open" as const, delay: 1.6 },
  { x: "78%", y: "5%",   size: 36, color: "#1a1a1a", bg: "oklch(0.85 0.25 130)", label: "gm",      eye: "dash" as const, mouth: "smile" as const, delay: 0.7 },
]

export function FloatingFaces() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 hidden lg:block" aria-hidden="true">
      {faces.map((face, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ left: face.x, top: face.y }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: face.delay, duration: 0.6, ease: "easeOut" }}
        >
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{
              repeat: Infinity,
              duration: 3 + (i % 3),
              ease: "easeInOut",
              delay: i * 0.3,
            }}
          >
            <SmileFace
              size={face.size}
              color={face.color}
              bgColor={face.bg}
              label={face.label}
              eyeStyle={face.eye}
              mouthStyle={face.mouth}
            />
          </motion.div>
        </motion.div>
      ))}
    </div>
  )
}
