"use client"

import dynamic from "next/dynamic"

const GridTradePage = dynamic(() => import("@/components/grid-trade-page"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-slate-950">
      <p className="text-white/60 text-sm">Loading...</p>
    </div>
  ),
})

export default function Page() {
  return <GridTradePage />
}
