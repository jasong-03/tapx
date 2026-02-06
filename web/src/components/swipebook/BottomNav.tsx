"use client"

import React from 'react';
import { cn } from '@/lib/utils';
import type { SwipeBookView } from '@/lib/swipebook/types';

interface BottomNavProps {
  currentView: SwipeBookView;
  onViewChange: (view: SwipeBookView) => void;
  isAuthenticated?: boolean;
}

export const BottomNav = React.memo(function BottomNav({
  currentView,
  onViewChange,
  isAuthenticated = false,
}: BottomNavProps) {
  // Base navigation items
  const baseNavItems: { view: SwipeBookView; label: string; icon: string }[] = [
    { view: 'swipe', label: 'Trade', icon: String.fromCodePoint(0x2194) }, // Left-right arrow
    { view: 'portfolio', label: 'Portfolio', icon: String.fromCodePoint(0x1F4B0) }, // Money bag
    { view: 'history', label: 'History', icon: String.fromCodePoint(0x1F4DC) }, // Scroll
    { view: 'leaderboard', label: 'Ranks', icon: String.fromCodePoint(0x1F3C6) }, // Trophy
  ];

  // Add profile tab only for authenticated users
  const navItems = isAuthenticated
    ? [...baseNavItems, { view: 'profile' as SwipeBookView, label: 'Profile', icon: String.fromCodePoint(0x1F464) }] // Bust silhouette
    : baseNavItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-800 safe-area-pb z-50">
      <div className="max-w-md mx-auto flex justify-around py-2">
        {navItems.map((item) => (
          <button
            key={item.view}
            onClick={() => onViewChange(item.view)}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-0",
              currentView === item.view
                ? "text-blue-400 bg-blue-400/10"
                : "text-slate-400 hover:text-slate-300"
            )}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-xs font-medium truncate">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
});
