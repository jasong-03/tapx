"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"

export function CTAFooter() {
  return (
    <section className="relative py-20 px-4 sm:py-28 sm:px-6">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-t from-neon-pink/10 via-transparent to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="relative z-10 mx-auto flex max-w-2xl flex-col items-center gap-6 text-center"
      >
        <h2 className="text-3xl font-bold sm:text-5xl">
          Ready to{" "}
          <span className="text-neon-lime">Trade</span>?
        </h2>
        <p className="text-muted-foreground">
          Join the next generation of DeFi trading on Sui. No sign-ups required.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="bg-neon-pink text-white hover:bg-neon-pink/90 glow-pink text-base px-8 py-3 h-auto"
          >
            <Link href="/swipebook">Launch App</Link>
          </Button>
        </div>

        <p className="mt-8 text-xs text-muted-foreground/60">
          Built for HackMoney 2026
        </p>
      </motion.div>
    </section>
  )
}
