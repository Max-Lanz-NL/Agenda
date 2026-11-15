import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Agenda', description: 'Jouw week in overzicht' };
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="nl"><body>{children}</body></html>;
}
