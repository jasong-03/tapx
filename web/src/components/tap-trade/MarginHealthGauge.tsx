"use client"

interface MarginHealthGaugeProps {
  riskRatio: number;
  visible: boolean;
}

export function MarginHealthGauge({ riskRatio, visible }: MarginHealthGaugeProps) {
  if (!visible) return null;

  const getHealthColor = () => {
    if (riskRatio > 1.5) return { color: '#22c55e', label: 'Healthy', ring: 'border-green-500' };
    if (riskRatio > 1.25) return { color: '#eab308', label: 'Caution', ring: 'border-yellow-500' };
    return { color: '#ef4444', label: 'Danger', ring: 'border-red-500' };
  };

  const health = getHealthColor();

  return (
    <div className="flex items-center gap-2">
      <div
        className={`
          w-10 h-10 rounded-full border-2 flex items-center justify-center
          ${health.ring}
          ${riskRatio < 1.25 ? 'animate-pulse' : ''}
        `}
      >
        <span className="text-[10px] font-bold" style={{ color: health.color }}>
          {riskRatio.toFixed(2)}
        </span>
      </div>
      <span className="text-[10px] text-white/50">{health.label}</span>
    </div>
  );
}
