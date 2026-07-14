'use client';

import { Navbar } from './Navbar';
import { ErrorBoundary } from './ErrorBoundary';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col max-w-full overflow-x-hidden">
        <a
          href="#main-content"
          className="skip-to-content"
        >
          Skip to main content
        </a>
        <header role="banner">
          <Navbar />
        </header>
        <main id="main-content" className="flex-1 pt-16" role="main">
          {children}
        </main>
        <footer role="contentinfo" className="text-center py-4 text-xs text-text-secondary border-t border-border-glass">
          <p>&copy; {new Date().getFullYear()} ShadowVault. Secure file sharing.</p>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
