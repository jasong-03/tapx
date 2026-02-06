"use client"

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface ShareButtonProps {
  /** Base token symbol */
  base: string;
  /** Quote token symbol */
  quote: string;
  /** Current price */
  price: number;
  /** Optional profit/loss data for outcome sharing */
  outcome?: {
    type: 'profit' | 'loss';
    amount: number;
    percentage: number;
  };
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}

/**
 * Get size classes
 */
function getSizeClasses(size: 'sm' | 'md' | 'lg') {
  switch (size) {
    case 'sm':
      return 'px-3 py-1.5 text-xs gap-1.5';
    case 'md':
      return 'px-4 py-2 text-sm gap-2';
    case 'lg':
      return 'px-5 py-2.5 text-base gap-2';
  }
}

/**
 * Get variant classes
 */
function getVariantClasses(variant: 'primary' | 'secondary' | 'ghost') {
  switch (variant) {
    case 'primary':
      return 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500';
    case 'secondary':
      return 'bg-slate-700 hover:bg-slate-600 text-white border-slate-600';
    case 'ghost':
      return 'bg-transparent hover:bg-slate-800 text-slate-300 border-slate-700';
  }
}

/**
 * Format price for display
 */
function formatPrice(price: number): string {
  if (price < 0.01) return price.toFixed(6);
  if (price < 1) return price.toFixed(4);
  if (price < 100) return price.toFixed(3);
  return price.toFixed(2);
}

/**
 * Share functionality component
 *
 * Uses Web Share API if available, falls back to clipboard copy.
 * Supports both simple price shares and trade outcome shares.
 *
 * @example
 * ```tsx
 * // Simple share
 * <ShareButton
 *   base="SUI"
 *   quote="USDC"
 *   price={1.234}
 * />
 *
 * // Outcome share
 * <ShareButton
 *   base="SUI"
 *   quote="USDC"
 *   price={1.234}
 *   outcome={{ type: 'profit', amount: 50, percentage: 25 }}
 * />
 * ```
 */
export function ShareButton({
  base,
  quote,
  price,
  outcome,
  size = 'md',
  variant = 'secondary',
  className,
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  /**
   * Generate share text
   */
  const getShareText = useCallback(() => {
    const priceStr = formatPrice(price);

    if (outcome) {
      const emoji = outcome.type === 'profit' ? String.fromCodePoint(0x1F4C8) : String.fromCodePoint(0x1F4C9);
      const sign = outcome.type === 'profit' ? '+' : '-';
      return `${emoji} ${sign}${outcome.percentage.toFixed(1)}% on ${base}/${quote}!\n\nCurrent price: ${priceStr} ${quote}\n\nSwipe to trade on SwipeBook`;
    }

    return `Check out ${base}/${quote} at ${priceStr} ${quote} on SwipeBook!`;
  }, [base, quote, price, outcome]);

  /**
   * Handle share action
   */
  const handleShare = useCallback(async () => {
    const shareText = getShareText();

    setIsSharing(true);

    try {
      // Try Web Share API first
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `${base}/${quote} - SwipeBook`,
          text: shareText,
          // url could be added here if we have a shareable link
        });
        setIsSharing(false);
        return;
      }
    } catch (error) {
      // User cancelled or share failed, fall back to clipboard
      if ((error as Error).name === 'AbortError') {
        setIsSharing(false);
        return;
      }
    }

    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }

    setIsSharing(false);
  }, [base, quote, getShareText]);

  const sizeClasses = getSizeClasses(size);
  const variantClasses = getVariantClasses(variant);

  return (
    <button
      onClick={handleShare}
      disabled={isSharing}
      className={cn(
        "inline-flex items-center justify-center rounded-lg border",
        "font-medium transition-all duration-200",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        sizeClasses,
        variantClasses,
        className
      )}
      aria-label="Share"
    >
      {/* Share icon */}
      {!copied ? (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
          />
        </svg>
      ) : (
        <svg
          className="w-4 h-4 text-green-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      )}

      <span>
        {copied ? 'Copied!' : isSharing ? 'Sharing...' : 'Share'}
      </span>
    </button>
  );
}

/**
 * Icon-only share button for compact layouts
 */
export function ShareIconButton({
  base,
  quote,
  price,
  outcome,
  className,
}: Omit<ShareButtonProps, 'size' | 'variant'>) {
  const [copied, setCopied] = useState(false);

  const getShareText = useCallback(() => {
    const priceStr = formatPrice(price);

    if (outcome) {
      const emoji = outcome.type === 'profit' ? String.fromCodePoint(0x1F4C8) : String.fromCodePoint(0x1F4C9);
      const sign = outcome.type === 'profit' ? '+' : '-';
      return `${emoji} ${sign}${outcome.percentage.toFixed(1)}% on ${base}/${quote}!\n\nCurrent price: ${priceStr} ${quote}\n\nSwipe to trade on SwipeBook`;
    }

    return `Check out ${base}/${quote} at ${priceStr} ${quote} on SwipeBook!`;
  }, [base, quote, price, outcome]);

  const handleShare = useCallback(async () => {
    const shareText = getShareText();

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `${base}/${quote} - SwipeBook`,
          text: shareText,
        });
        return;
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [base, quote, getShareText]);

  return (
    <button
      onClick={handleShare}
      className={cn(
        "p-2 rounded-lg",
        "bg-slate-800 hover:bg-slate-700",
        "border border-slate-700 hover:border-slate-600",
        "text-slate-400 hover:text-white",
        "transition-all duration-200",
        className
      )}
      aria-label="Share"
      title={copied ? 'Copied!' : 'Share'}
    >
      {!copied ? (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
          />
        </svg>
      ) : (
        <svg
          className="w-5 h-5 text-green-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      )}
    </button>
  );
}
