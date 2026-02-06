"use client"

import { useEffect, useState } from "react"

interface ToastProps {
  message: string
  type: "error" | "success" | "info"
  onClose: () => void
}

export function Toast({ message, type, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onClose, 300)
    }, 2500)

    return () => clearTimeout(timer)
  }, [onClose])

  const bgColor = {
    error: "bg-red-500/90",
    success: "bg-neon-lime/90",
    info: "bg-neon-pink/90",
  }[type]

  const textColor = type === "success" ? "text-black" : "text-white"

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg ${bgColor} ${textColor} text-sm font-medium shadow-lg transition-all duration-300 z-50 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
      }`}
    >
      {message}
    </div>
  )
}
