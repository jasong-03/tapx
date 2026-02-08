"use client"

import { useEffect, useRef, useState } from 'react';

interface CountdownRingProps {
  duration: number; // seconds
  startedAt: number; // timestamp ms
  size?: number;
}

export function CountdownRing({ duration, startedAt, size = 80 }: CountdownRingProps) {
  const [remaining, setRemaining] = useState(duration);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const left = Math.max(0, duration - elapsed);
      setRemaining(left);
      if (left > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [duration, startedAt]);

  const isExpired = remaining <= 0;
  const fraction = remaining / duration; // 1 -> 0
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - fraction);

  // Color transitions: cyan -> yellow (< 5s) -> green pulse (expired = result!)
  let strokeColor = '#22d3ee'; // cyan
  if (remaining <= 5 && remaining > 0) strokeColor = '#eab308'; // yellow urgency
  if (isExpired) strokeColor = '#22c55e'; // green = done!

  let bgRing = 'rgba(255,255,255,0.06)';
  if (isExpired) bgRing = 'rgba(34,197,94,0.15)';

  const displaySeconds = Math.ceil(remaining);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={bgRing}
          strokeWidth={3}
        />
        {/* Countdown arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke 0.3s ease' }}
        />
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {isExpired ? (
          <span className="text-xl">🏁</span>
        ) : (
          <>
            <span className="text-xl font-black tabular-nums text-white">
              {displaySeconds}
            </span>
            <span className="text-[8px] text-white/40 -mt-0.5">sec</span>
          </>
        )}
      </div>
    </div>
  );
}
