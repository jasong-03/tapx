"use client"

import { motion } from "framer-motion"
import { Wallet, Grid3X3, Trophy } from "lucide-react"

const steps = [
  {
    number: "1",
    title: "Connect Wallet",
    description: "Link your Sui wallet in one tap. No sign-ups, no KYC. Your keys, your funds.",
    icon: Wallet,
    color: "bg-neon-pink/20 text-neon-pink",
    numberBg: "bg-neon-pink",
  },
  {
    number: "2",
    title: "Tap the Grid",
    description: "Swipe right to buy, left to sell. View live prices, charts, and AI signals — all in one card.",
    icon: Grid3X3,
    color: "bg-neon-lime/20 text-neon-lime",
    numberBg: "bg-neon-lime",
  },
  {
    number: "3",
    title: "Earn & Compete",
    description: "Rack up XP, climb the leaderboard, and unlock achievements. Trading has never been this fun.",
    icon: Trophy,
    color: "bg-neon-yellow/20 text-neon-yellow",
    numberBg: "bg-neon-yellow",
  },
]

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
}

export function HowItWorks() {
  return (
    <section className="relative py-20 px-4 sm:py-28 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center text-3xl font-bold sm:text-4xl"
        >
          How It Works
        </motion.h2>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ staggerChildren: 0.15 }}
          className="grid gap-6 sm:grid-cols-3"
        >
          {steps.map((step) => (
            <motion.div
              key={step.number}
              variants={cardVariants}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center gap-4 rounded-2xl border border-white/5 bg-card/50 p-6 text-center backdrop-blur-sm"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${step.numberBg} text-sm font-bold text-background`}>
                {step.number}
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${step.color}`}>
                <step.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
