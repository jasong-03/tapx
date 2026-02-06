"use client"

import { Minus, Plus } from "lucide-react"

interface StakeSelectorProps {
  stake: number
  stakes: number[]
  onStakeChange: (stake: number) => void
}

export function StakeSelector({ stake, stakes, onStakeChange }: StakeSelectorProps) {
  const currentIndex = stakes.indexOf(stake)

  const decrease = () => {
    if (currentIndex > 0) {
      onStakeChange(stakes[currentIndex - 1])
    }
  }

  const increase = () => {
    if (currentIndex < stakes.length - 1) {
      onStakeChange(stakes[currentIndex + 1])
    }
  }

  return (
    <div className="flex items-center gap-0.5 rounded-full bg-secondary/80 backdrop-blur-sm border border-border/50">
      <button
        onClick={decrease}
        disabled={currentIndex <= 0}
        className="p-1.5 hover:bg-muted/50 rounded-l-full transition-colors disabled:opacity-30"
      >
        <Minus className="w-3.5 h-3.5 text-foreground" />
      </button>
      <div className="px-2 py-0.5 min-w-[50px] text-center">
        <span className="text-[10px] text-muted-foreground">Stake</span>
        <span className="block text-xs sm:text-sm font-mono font-semibold text-neon-lime">${stake}</span>
      </div>
      <button
        onClick={increase}
        disabled={currentIndex >= stakes.length - 1}
        className="p-1.5 hover:bg-muted/50 rounded-r-full transition-colors disabled:opacity-30"
      >
        <Plus className="w-3.5 h-3.5 text-foreground" />
      </button>
    </div>
  )
}
