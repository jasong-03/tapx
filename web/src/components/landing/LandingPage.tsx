"use client"

import { HeroSection } from "./HeroSection"
import { HowItWorks } from "./HowItWorks"
import { FeatureCards } from "./FeatureCards"
import { LiveStats } from "./LiveStats"
import { CTAFooter } from "./CTAFooter"
import { FloatingFaces } from "./FloatingFaces"

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <FloatingFaces />
      <HeroSection />
      <HowItWorks />
      <FeatureCards />
      <LiveStats />
      <CTAFooter />
    </main>
  )
}
