"use client"

interface TileScalerProps {
  zoom: number
  onZoomChange: (zoom: number) => void
}

const ZOOM_LEVELS = [1, 2, 5, 10, 20]

export function TileScaler({ zoom, onZoomChange }: TileScalerProps) {
  return (
    <div className="flex items-center gap-1 sm:gap-2 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 px-2 sm:px-3 py-1.5 sm:py-2">
      <span className="text-[10px] sm:text-xs text-muted-foreground mr-0.5 sm:mr-1">Zoom</span>
      {ZOOM_LEVELS.map((z) => (
        <button
          key={z}
          onClick={() => onZoomChange(z)}
          className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-mono rounded transition-all ${
            zoom === z
              ? "bg-fuchsia-500/30 text-fuchsia-300 border border-fuchsia-500/50"
              : "text-muted-foreground hover:text-white hover:bg-white/10"
          }`}
        >
          {z}x
        </button>
      ))}
    </div>
  )
}
