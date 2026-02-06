"use client"

import { useEffect, useState } from "react"

interface ToastProps {
  message: string
  type: "error" | "success" | "info"
  onClose: () => void
}

export function Toast({ message, type, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true)

  const duration = type === "success" ? 3500 : 2500

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onClose, 300)
    }, duration)

    return () => clearTimeout(timer)
  }, [onClose, duration])

  const styles = {
    error: "bg-red-500/95 text-white border-red-400/30",
    success: "bg-emerald-500/95 text-white border-emerald-400/30",
    info: "bg-sky-500/95 text-white border-sky-400/30",
  }[type]

  const icon = {
    error: "\u2717",
    success: "\u2713",
    info: "\u2139",
  }[type]

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-xl ${styles} border text-sm font-semibold shadow-2xl backdrop-blur-sm transition-all duration-300 z-50 max-w-[90vw] ${
        isVisible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-2 scale-95"
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="truncate">{message}</span>
    </div>
  )
}
