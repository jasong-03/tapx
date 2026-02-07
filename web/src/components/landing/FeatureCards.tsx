"use client"

import { motion } from "framer-motion"
import { Grid3X3, TrendingUp, Trophy, Shield } from "lucide-react"

const features = [
  {
    title: "Tap-to-Trade Grid",
    description: "Swipe through tokens like a pro. Real-time prices, mini charts, and one-tap execution powered by DeepBook V3.",
    icon: Grid3X3,
    gradient: "from-neon-pink/20 to-neon-pink/5",
    glowColor: "hover:shadow-[0_0_30px_rgba(255,100,200,0.15)]",
    borderHover: "hover:border-neon-pink/30",
  },
  {
    title: "Margin Trading",
    description: "Trade with up to 5x leverage. Set lot sizes, manage positions, and close with a single swipe.",
    icon: TrendingUp,
    gradient: "from-neon-lime/20 to-neon-lime/5",
    glowColor: "hover:shadow-[0_0_30px_rgba(180,255,100,0.15)]",
    borderHover: "hover:border-neon-lime/30",
  },
  {
    title: "Gamified Experience",
    description: "Earn XP for every trade, unlock achievements, and compete on the global leaderboard. DeFi meets gaming.",
    icon: Trophy,
    gradient: "from-neon-yellow/20 to-neon-yellow/5",
    glowColor: "hover:shadow-[0_0_30px_rgba(255,230,100,0.15)]",
    borderHover: "hover:border-neon-yellow/30",
  },
  {
    title: "Risk-Free Demo",
    description: "Practice with $10,000 in virtual funds. Learn the interface, test strategies, zero risk.",
    icon: Shield,
    gradient: "from-neon-purple/20 to-neon-purple/5",
    glowColor: "hover:shadow-[0_0_30px_rgba(160,100,255,0.15)]",
    borderHover: "hover:border-neon-purple/30",
  },
]

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
}

export function FeatureCards() {
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
          Built for Traders
        </motion.h2>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ staggerChildren: 0.1 }}
          className="grid gap-6 sm:grid-cols-2"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={cardVariants}
              transition={{ duration: 0.5 }}
              whileHover={{ y: -4 }}
              className={`group relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br ${feature.gradient} p-6 backdrop-blur-sm transition-all duration-300 ${feature.glowColor} ${feature.borderHover}`}
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5">
                  <feature.icon className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
