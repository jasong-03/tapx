import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'SwipeBook - Swipe to Trade',
  description: 'Swipe-based trading interface for DeepBook on Sui',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0f172a',
};

export default function SwipeBookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {children}
    </div>
  );
}
