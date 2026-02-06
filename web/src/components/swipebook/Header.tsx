"use client"

import React from 'react';
import { ConnectButton } from '@mysten/dapp-kit-react';
import { cn } from '@/lib/utils';
import type { UserProgress } from '@/lib/gamification/types';
import { XPBar } from '@/components/gamification/XPBar';
import { StreakIndicator } from '@/components/gamification/StreakBadge';

interface HeaderProps {
  userProgress: UserProgress | null;
  authMode: 'wallet' | 'zklogin' | 'browse';
  className?: string;
}

export const Header = React.memo(function Header({
  userProgress,
  authMode,
  className,
}: HeaderProps) {
  const isAuthenticated = authMode !== 'browse';

  return (
    <header
      className={cn(
        "flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm",
        className
      )}
    >
      {/* Logo/Title */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-white">SwipeBook</h1>
      </div>

      {/* Gamification Display (for authenticated users) */}
      {isAuthenticated && userProgress && (
        <div className="flex items-center gap-3 flex-1 mx-4 max-w-xs">
          {/* Compact XP Bar */}
          <XPBar progress={userProgress} compact className="flex-1" />

          {/* Streak Badge */}
          {userProgress.streak.current > 0 && (
            <StreakIndicator streak={userProgress.streak.current} />
          )}
        </div>
      )}

      {/* Connect Button */}
      <div className="flex items-center">
        <ConnectButton />
      </div>
    </header>
  );
});
