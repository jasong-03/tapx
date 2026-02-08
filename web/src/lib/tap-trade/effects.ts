/**
 * Visual and haptic feedback utilities
 */
import confetti from "canvas-confetti"

export const effects = {
  /**
   * Fire confetti animation for wins
   */
  confetti: () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#a3e635", "#22d3ee", "#f472b6", "#facc15"],
      disableForReducedMotion: true,
    })
  },

  /**
   * Trigger haptic feedback on mobile devices
   * @param pattern - Vibration pattern (number or array of numbers)
   */
  haptic: (pattern: number | number[] = 50) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern)
    }
  },

  /**
   * Combined win celebration effect
   */
  celebrateWin: () => {
    effects.confetti()
    effects.haptic([50, 30, 100])
  },

  /**
   * Loss feedback effect
   */
  notifyLoss: () => {
    effects.haptic([100, 50, 100])
  },

  /**
   * Generic interaction feedback
   */
  tap: () => {
    effects.haptic(30)
  },
}
