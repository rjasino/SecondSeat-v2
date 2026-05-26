import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import NavBanner from '@/components/layout/nav-banner';
import './globals.css';

export const metadata: Metadata = {
  title: 'SecondSeat',
  description: 'Second-screen, spoiler-safe gaming companion.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100">
        <NavBanner />
        {children}
      </body>
    </html>
  );
}
