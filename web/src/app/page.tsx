"use client"

import dynamic from "next/dynamic";

const HomeContent = dynamic(() => import("@/components/home-content"), {
  ssr: false,
  loading: () => (
    <div className="w-screen h-screen flex items-center justify-center">
      <p className="text-white/60 text-sm">Loading...</p>
    </div>
  ),
});

export default function Home() {
  return <HomeContent />;
}
