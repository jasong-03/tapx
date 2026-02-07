"use client"

interface SimulationToggleProps {
  isSimulation: boolean;
  onToggle: (value: boolean) => void;
}

export function SimulationToggle({ isSimulation, onToggle }: SimulationToggleProps) {
  return (
    <button
      onClick={() => onToggle(!isSimulation)}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all ${
        isSimulation
          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
      }`}
      title={isSimulation ? 'Switch to live trading' : 'Switch to simulation'}
    >
      <div
        className={`w-2 h-2 rounded-full ${
          isSimulation ? 'bg-amber-400' : 'bg-emerald-400'
        }`}
      />
      <span>{isSimulation ? 'SIM' : 'LIVE'}</span>
    </button>
  );
}
