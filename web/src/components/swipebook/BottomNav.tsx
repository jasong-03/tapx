"use client"

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
  const router = useRouter();
  const pathname = usePathname();

  const isGridRoute = pathname === '/swipebook/grid';

  // Navigation items with route-based tabs for Trade and Grid
  type NavItem = { id: string; label: string; icon: string; action: () => void };

  const baseItems: NavItem[] = [
    {
      id: 'trade',
      label: 'Trade',
      icon: String.fromCodePoint(0x2194), // Left-right arrow
      action: () => {
        if (isGridRoute) {
          router.push('/swipebook');
        } else {
          onViewChange('swipe');
        }
      },
    },
    {
      id: 'grid',
      label: 'Grid',
      icon: String.fromCodePoint(0x1F3AF), // Dart/target
      action: () => {
        if (!isGridRoute) {
          router.push('/swipebook/grid');
        } else {
          onViewChange('swipe');
        }
      },
    },
    {
      id: 'portfolio',
      label: 'Portfolio',
      icon: String.fromCodePoint(0x1F4B0), // Money bag
      action: () => onViewChange('portfolio'),
    },
    {
      id: 'history',
      label: 'History',
      icon: String.fromCodePoint(0x1F4DC), // Scroll
      action: () => onViewChange('history'),
    },
    {
      id: 'leaderboard',
      label: 'Ranks',
      icon: String.fromCodePoint(0x1F3C6), // Trophy
      action: () => onViewChange('leaderboard'),
    },
  ];

  const navItems = isAuthenticated
    ? [...baseItems, {
        id: 'profile',
        label: 'Profile',
        icon: String.fromCodePoint(0x1F464), // Bust silhouette
        action: () => onViewChange('profile'),
      }]
    : baseItems;

  // Determine which tab is active
  function isActive(id: string): boolean {
    if (id === 'trade') return !isGridRoute && currentView === 'swipe';
    if (id === 'grid') return isGridRoute && currentView === 'swipe';
    if (id === 'portfolio') return currentView === 'portfolio';
    if (id === 'history') return currentView === 'history';
    if (id === 'leaderboard') return currentView === 'leaderboard';
    if (id === 'profile') return currentView === 'profile';
    return false;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-800 safe-area-pb z-50">
      <div className="mx-auto flex justify-around py-2 max-w-lg">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={item.action}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-0",
              isActive(item.id)
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
