"use client"

import dynamic from "next/dynamic";

const UtilsContent = dynamic(() => import("@/components/utils-content"), {
  ssr: false,
  loading: () => (
    <div className="flex w-screen h-screen items-center justify-center">
      <p className="text-white/60 text-sm">Loading...</p>
    </div>
  ),
});

export default function Utils() {
  return <UtilsContent />;
}
