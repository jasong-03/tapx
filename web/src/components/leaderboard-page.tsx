"use client"

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { cn } from '@/lib/utils';
import type { UserRank } from '@/lib/gamification/types';

type LeaderboardTab = 'weekly' | 'alltime';

interface LeaderboardEntry {
  rank: number;
  address: string;
  username?: string;
  level: number;
  xp: number;
  userRank: UserRank;
  isCurrentUser?: boolean;
}

/**
 * Mock leaderboard data generator
 */
function generateMockLeaderboard(tab: LeaderboardTab): LeaderboardEntry[] {
  const baseXp = tab === 'weekly' ? 5000 : 50000;
  const entries: LeaderboardEntry[] = [];

  // Generate top 20 traders
  for (let i = 0; i < 20; i++) {
    const xp = Math.floor(baseXp * Math.pow(0.85, i) + Math.random() * 1000);
    const level = Math.min(100, Math.floor(Math.sqrt(xp / 50)));

    let userRank: UserRank = 'Novice';
    if (level >= 75) userRank = 'Legend';
    else if (level >= 50) userRank = 'Master';
    else if (level >= 25) userRank = 'Expert';
    else if (level >= 10) userRank = 'Trader';

    entries.push({
      rank: i + 1,
      address: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`,
      level,
      xp,
      userRank,
    });
  }

  return entries;
}

/**
 * Get rank color classes
 */
function getRankColors(rank: UserRank): { bg: string; text: string } {
  switch (rank) {
    case 'Novice':
      return { bg: 'bg-slate-500/20', text: 'text-slate-300' };
    case 'Trader':
      return { bg: 'bg-blue-500/20', text: 'text-blue-300' };
    case 'Expert':
      return { bg: 'bg-purple-500/20', text: 'text-purple-300' };
    case 'Master':
      return { bg: 'bg-orange-500/20', text: 'text-orange-300' };
    case 'Legend':
      return { bg: 'bg-yellow-500/20', text: 'text-yellow-300' };
    default:
      return { bg: 'bg-slate-500/20', text: 'text-slate-300' };
  }
}

/**
 * Get position medal/display
 */
function getPositionDisplay(rank: number): { icon: string; color: string } {
  switch (rank) {
    case 1:
      return { icon: String.fromCodePoint(0x1F947), color: 'text-yellow-400' }; // Gold medal
    case 2:
      return { icon: String.fromCodePoint(0x1F948), color: 'text-slate-300' }; // Silver medal
    case 3:
      return { icon: String.fromCodePoint(0x1F949), color: 'text-amber-600' }; // Bronze medal
    default:
      return { icon: `#${rank}`, color: 'text-slate-400' };
  }
}

/**
 * Leaderboard entry row component
 */
const LeaderboardRow = React.memo(function LeaderboardRow({
  entry,
}: {
  entry: LeaderboardEntry;
}) {
  const position = getPositionDisplay(entry.rank);
  const rankColors = getRankColors(entry.userRank);

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl transition-colors",
        entry.isCurrentUser
          ? "bg-blue-500/20 border border-blue-500/50"
          : "bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800"
      )}
    >
      {/* Position */}
      <div className={cn("w-10 text-center font-bold", position.color)}>
        {entry.rank <= 3 ? (
          <span className="text-xl">{position.icon}</span>
        ) : (
          <span className="text-sm">{position.icon}</span>
        )}
      </div>

      {/* User Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm font-medium truncate",
              entry.isCurrentUser ? "text-blue-300" : "text-white"
            )}
          >
            {entry.username || entry.address}
          </span>
          {entry.isCurrentUser && (
            <span className="text-xs bg-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full">
              You
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-full",
              rankColors.bg,
              rankColors.text
            )}
          >
            {entry.userRank}
          </span>
          <span className="text-xs text-slate-500">Lv. {entry.level}</span>
        </div>
      </div>

      {/* XP */}
      <div className="text-right">
        <span className="text-sm font-bold text-white">
          {entry.xp.toLocaleString()}
        </span>
        <span className="text-xs text-slate-400 ml-1">XP</span>
      </div>
    </div>
  );
});

export default function LeaderboardPage() {
  const currentAccount = useCurrentAccount();
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('weekly');

  // Generate mock leaderboard with current user highlighted if connected
  const leaderboard = useMemo(() => {
    const entries = generateMockLeaderboard(activeTab);

    // If user is connected, randomly place them in the leaderboard
    if (currentAccount?.address) {
      const userPosition = Math.floor(Math.random() * 15) + 3; // Position 3-17
      const truncatedAddress = `${currentAccount.address.slice(0, 6)}...${currentAccount.address.slice(-4)}`;

      if (userPosition < entries.length) {
        entries[userPosition] = {
          ...entries[userPosition],
          address: truncatedAddress,
          isCurrentUser: true,
        };
      }
    }

    return entries;
  }, [activeTab, currentAccount?.address]);

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
        <h1 className="text-lg font-bold text-white">Leaderboard</h1>
        <div className="w-16" /> {/* Spacer for centering */}
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Tabs */}
        <div className="flex gap-2 p-1 rounded-xl bg-slate-800/50 border border-slate-700">
          <button
            onClick={() => setActiveTab('weekly')}
            className={cn(
              "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all",
              activeTab === 'weekly'
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            )}
          >
            Weekly
          </button>
          <button
            onClick={() => setActiveTab('alltime')}
            className={cn(
              "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all",
              activeTab === 'alltime'
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            )}
          >
            All Time
          </button>
        </div>

        {/* Top 3 Podium */}
        <div className="flex justify-center items-end gap-2 py-6">
          {/* 2nd Place */}
          {leaderboard[1] && (
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center text-lg font-bold mb-2">
                {leaderboard[1].level}
              </div>
              <span className="text-xl">{String.fromCodePoint(0x1F948)}</span>
              <p className="text-xs text-slate-400 mt-1 truncate max-w-[80px]">
                {leaderboard[1].address}
              </p>
              <p className="text-xs text-white font-medium">
                {leaderboard[1].xp.toLocaleString()} XP
              </p>
            </div>
          )}

          {/* 1st Place */}
          {leaderboard[0] && (
            <div className="flex flex-col items-center -mt-4">
              <div className="w-18 h-18 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center text-xl font-bold mb-2 w-[72px] h-[72px] ring-4 ring-yellow-400/30">
                {leaderboard[0].level}
              </div>
              <span className="text-2xl">{String.fromCodePoint(0x1F947)}</span>
              <p className="text-xs text-slate-400 mt-1 truncate max-w-[80px]">
                {leaderboard[0].address}
              </p>
              <p className="text-sm text-white font-bold">
                {leaderboard[0].xp.toLocaleString()} XP
              </p>
            </div>
          )}

          {/* 3rd Place */}
          {leaderboard[2] && (
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center text-lg font-bold mb-2">
                {leaderboard[2].level}
              </div>
              <span className="text-xl">{String.fromCodePoint(0x1F949)}</span>
              <p className="text-xs text-slate-400 mt-1 truncate max-w-[80px]">
                {leaderboard[2].address}
              </p>
              <p className="text-xs text-white font-medium">
                {leaderboard[2].xp.toLocaleString()} XP
              </p>
            </div>
          )}
        </div>

        {/* Full Leaderboard List */}
        <div className="space-y-2">
          {leaderboard.map((entry) => (
            <LeaderboardRow key={`${entry.rank}-${entry.address}`} entry={entry} />
          ))}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-500 pt-4">
          {activeTab === 'weekly'
            ? 'Leaderboard resets every Monday at 00:00 UTC'
            : 'All-time rankings based on total XP earned'}
        </p>
      </div>
    </div>
  );
}
