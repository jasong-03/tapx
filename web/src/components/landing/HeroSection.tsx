"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { NeonGridBackground } from "./NeonGridBackground"

const wordVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
}

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      <NeonGridBackground />

      {/* Gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />

      <div className="relative z-10 flex flex-col items-center gap-6 px-4 text-center">
        {/* Hackathon badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="flex items-center gap-2 rounded-full border border-neon-lime/30 bg-neon-lime/5 px-4 py-1.5 text-sm text-neon-lime"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-lime opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-neon-lime" />
          </span>
          HackMoney x Sui 2026
        </motion.div>

        {/* Staggered headline */}
        <motion.h1
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-wrap items-center justify-center gap-x-4 text-5xl font-bold tracking-tight sm:text-7xl md:text-8xl"
        >
          <motion.span
            variants={wordVariants}
            transition={{ duration: 0.5 }}
            className="text-neon-pink"
          >
            Tap.
          </motion.span>
          <motion.span
            variants={wordVariants}
            transition={{ duration: 0.5 }}
            className="text-neon-lime"
          >
            Trade.
          </motion.span>
          <motion.span
            variants={wordVariants}
            transition={{ duration: 0.5 }}
            className="text-neon-yellow"
          >
            Earn.
          </motion.span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="max-w-lg text-base text-muted-foreground sm:text-lg"
        >
          The DeFi trading platform built on Sui.
          Tap to trade, predict with leverage, and earn real on-chain rewards.
        </motion.p>

        {/* CTA buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5, duration: 0.5 }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <Button
            asChild
            size="lg"
            className="bg-neon-pink text-white hover:bg-neon-pink/90 glow-pink text-base px-8 py-3 h-auto"
          >
            <Link href="/swipebook">Start Trading</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-neon-lime/40 text-neon-lime hover:bg-neon-lime/10 text-base px-8 py-3 h-auto"
          >
            <Link href="/swipebook">Try Demo Mode</Link>
          </Button>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
      >
        <div className="flex h-8 w-5 items-start justify-center rounded-full border-2 border-white/20 p-1">
          <motion.div
            className="h-1.5 w-1.5 rounded-full bg-white/40"
            animate={{ y: [0, 8, 0] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          />
        </div>
      </motion.div>
    </section>
  )
}
