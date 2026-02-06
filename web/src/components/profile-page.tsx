"use client"

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { cn } from '@/lib/utils';
import { useGamification } from '@/hooks/useGamification';
import { XPBar } from '@/components/gamification/XPBar';
import { StreakBadge } from '@/components/gamification/StreakBadge';
import type { UserRank, Badge } from '@/lib/gamification/types';

/**
 * Get rank color classes
 */
function getRankColors(rank: UserRank): { bg: string; text: string; border: string } {
  switch (rank) {
    case 'Novice':
      return { bg: 'bg-slate-500/20', text: 'text-slate-300', border: 'border-slate-500/50' };
    case 'Trader':
      return { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/50' };
    case 'Expert':
      return { bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/50' };
    case 'Master':
      return { bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500/50' };
    case 'Legend':
      return { bg: 'bg-yellow-500/20', text: 'text-yellow-300', border: 'border-yellow-500/50' };
    default:
      return { bg: 'bg-slate-500/20', text: 'text-slate-300', border: 'border-slate-500/50' };
  }
}

/**
 * Badge display component
 */
const BadgeItem = React.memo(function BadgeItem({ badge }: { badge: Badge }) {
  return (
    <div
      className="flex flex-col items-center gap-1 p-3 rounded-xl bg-slate-800/50 border border-slate-700"
      title={`Earned: ${new Date(badge.earnedAt).toLocaleDateString()}`}
    >
      <span className="text-2xl">{badge.icon}</span>
      <span className="text-xs text-slate-300 text-center">{badge.name}</span>
    </div>
  );
});

/**
 * Stat card component
 */
const StatCard = React.memo(function StatCard({
  label,
  value,
  subValue,
  colorClass = 'text-white',
}: {
  label: string;
  value: string | number;
  subValue?: string;
  colorClass?: string;
}) {
  return (
    <div className="flex flex-col items-center p-4 rounded-xl bg-slate-800/50 border border-slate-700">
      <span className="text-xs text-slate-400 mb-1">{label}</span>
      <span className={cn("text-2xl font-bold", colorClass)}>{value}</span>
      {subValue && (
        <span className="text-xs text-slate-500 mt-1">{subValue}</span>
      )}
    </div>
  );
});

export default function ProfilePage() {
  const currentAccount = useCurrentAccount();
  const { progress, isLoading } = useGamification();

  // Format volume with K/M/B suffix
  const formattedVolume = useMemo(() => {
    if (!progress) return '$0';
    const vol = progress.stats.totalVolume;
    if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(2)}B`;
    if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(2)}M`;
    if (vol >= 1_000) return `$${(vol / 1_000).toFixed(2)}K`;
    return `$${vol.toFixed(2)}`;
  }, [progress]);

  // Format win rate as percentage
  const winRatePercent = useMemo(() => {
    if (!progress || progress.stats.totalTrades === 0) return '0%';
    return `${(progress.stats.winRate * 100).toFixed(1)}%`;
  }, [progress]);

  // Not connected state
  if (!currentAccount) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-4 bg-slate-950">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2 text-white">Profile</h1>
          <p className="text-slate-400">Connect your wallet to view your profile</p>
        </div>
        <Link
          href="/swipebook"
          className="px-6 py-3 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors"
        >
          Back to SwipeBook
        </Link>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  const rankColors = progress ? getRankColors(progress.rank) : getRankColors('Novice');
  const truncatedAddress = currentAccount.address
    ? `${currentAccount.address.slice(0, 6)}...${currentAccount.address.slice(-4)}`
    : 'Unknown';

  return (
    <div className="min-h-screen bg-slate-950 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm">
        <Link
          href="/swipebook"
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <span className="text-xl">&#8592;</span>
          <span className="font-medium">Back</span>
        </Link>
        <h1 className="text-lg font-bold text-white">Profile</h1>
        <div className="w-16" /> {/* Spacer for centering */}
      </header>

      <div className="max-w-md mx-auto p-4 space-y-6">
        {/* User Info Card */}
        <div className="rounded-2xl bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 p-6">
          {/* Avatar and Rank */}
          <div className="flex items-center gap-4 mb-6">
            {/* Avatar with level */}
            <div className="relative">
              <div
                className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold",
                  "bg-gradient-to-br from-blue-600 to-purple-600"
                )}
              >
                {progress?.level || 1}
              </div>
              {progress && progress.streak.current > 0 && (
                <div className="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-0.5">
                  <span className="text-sm" role="img" aria-label="fire">
                    {String.fromCodePoint(0x1F525)}
                  </span>
                </div>
              )}
            </div>

            {/* User info */}
            <div className="flex-1">
              <p className="text-white font-medium mb-1">{truncatedAddress}</p>
              <div
                className={cn(
                  "inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border",
                  rankColors.bg,
                  rankColors.text,
                  rankColors.border
                )}
              >
                {progress?.rank || 'Novice'}
              </div>
            </div>
          </div>

          {/* XP Progress */}
          <XPBar progress={progress} className="mb-4" />

          {/* Streak */}
          <div className="flex justify-center">
            <StreakBadge
              streak={progress?.streak.current || 0}
              showMultiplier
              size="lg"
            />
          </div>
        </div>

        {/* Trading Stats */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Trading Stats</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Total Trades"
              value={progress?.stats.totalTrades || 0}
            />
            <StatCard
              label="Win Rate"
              value={winRatePercent}
              colorClass={
                (progress?.stats.winRate || 0) >= 0.5 ? 'text-green-400' : 'text-red-400'
              }
            />
            <StatCard
              label="Profitable Trades"
              value={progress?.stats.profitableTrades || 0}
              colorClass="text-green-400"
            />
            <StatCard
              label="Total Volume"
              value={formattedVolume}
              colorClass="text-blue-400"
            />
          </div>
        </div>

        {/* Badges Earned */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">
            Badges Earned ({progress?.badges.length || 0})
          </h2>
          {progress && progress.badges.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {progress.badges.map((badge) => (
                <BadgeItem key={badge.id} badge={badge} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 rounded-xl bg-slate-800/30 border border-slate-700/50">
              <p className="text-slate-400">No badges earned yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Keep trading to unlock achievements!
              </p>
            </div>
          )}
        </div>

        {/* Streak History */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Streak History</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Current Streak"
              value={`${progress?.streak.current || 0} days`}
              colorClass="text-orange-400"
            />
            <StatCard
              label="Longest Streak"
              value={`${progress?.streak.longest || 0} days`}
              colorClass="text-yellow-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
