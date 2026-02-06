"use client"

interface TileScalerProps {
  zoom: number
  onZoomChange: (zoom: number) => void
}

const ZOOM_LEVELS = [1, 2, 5, 10, 20]

export function TileScaler({ zoom, onZoomChange }: TileScalerProps) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 px-3 py-2">
      <span className="text-xs text-muted-foreground mr-1">Zoom</span>
      {ZOOM_LEVELS.map((z) => (
        <button
          key={z}
          onClick={() => onZoomChange(z)}
          className={`px-2 py-1 text-xs font-mono rounded transition-all ${
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
