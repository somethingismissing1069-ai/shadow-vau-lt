'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Shield, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const focusRingClasses =
  'focus:outline-none focus:ring-2 focus:ring-text-accent/50 focus:ring-offset-2 focus:ring-offset-bg-primary';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const displayUsername =
    user?.username && user.username.length > 20
      ? user.username.slice(0, 20) + '…'
      : user?.username ?? '';

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const isActive = (href: string) => pathname === href;

  const linkClasses = (href: string) =>
    `text-sm transition-colors ${focusRingClasses} rounded ${
      isActive(href)
        ? 'text-text-primary font-medium'
        : 'text-text-secondary hover:text-text-primary'
    }`;

  const mobileLinkClasses = (href: string) =>
    `text-sm py-2 transition-colors ${focusRingClasses} rounded ${
      isActive(href)
        ? 'text-text-primary font-medium'
        : 'text-text-secondary hover:text-text-primary'
    }`;

  return (
    <nav
      role="navigation"
      aria-label="Main navigation"
      className="glass-navbar fixed top-0 left-0 right-0 z-40"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            href="/"
            className={`flex items-center gap-2 group ${focusRingClasses} rounded`}
          >
            <Shield className="h-6 w-6 text-text-accent group-hover:text-text-accent/80 transition-colors" />
            <span className="text-lg font-bold text-text-primary">
              ShadowVault
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {isAuthenticated ? (
              <>
                <Link
                  href="/dashboard"
                  className={linkClasses('/dashboard')}
                  aria-current={isActive('/dashboard') ? 'page' : undefined}
                >
                  Dashboard
                </Link>
                <Link
                  href="/upload"
                  className={linkClasses('/upload')}
                  aria-current={isActive('/upload') ? 'page' : undefined}
                >
                  Upload
                </Link>
                <Link
                  href="/audit"
                  className={linkClasses('/audit')}
                  aria-current={isActive('/audit') ? 'page' : undefined}
                >
                  Audit Log
                </Link>
                {user?.isAdmin && (
                  <Link
                    href="/admin"
                    className={linkClasses('/admin')}
                    aria-current={isActive('/admin') ? 'page' : undefined}
                  >
                    Admin
                  </Link>
                )}
                <div className="flex items-center gap-3 pl-4 border-l border-border-glass">
                  <span className="text-sm text-text-secondary">
                    {displayUsername}
                  </span>
                  <button
                    onClick={handleLogout}
                    className={`text-sm text-status-error hover:text-status-error/80 transition-colors ${focusRingClasses} rounded`}
                    aria-label="Logout"
                  >
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className={`inline-flex items-center px-4 py-2 text-sm font-medium text-text-primary border border-border-glass hover:border-text-accent/50 hover:text-text-accent rounded-xl transition-all ${focusRingClasses} ${
                    isActive('/login') ? 'border-text-accent text-text-accent' : ''
                  }`}
                  aria-current={isActive('/login') ? 'page' : undefined}
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className={`inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-text-accent hover:bg-text-accent/80 rounded-xl border border-text-accent/50 transition-all ${focusRingClasses} ${
                    isActive('/register') ? 'ring-2 ring-text-accent/60' : ''
                  }`}
                  aria-current={isActive('/register') ? 'page' : undefined}
                >
                  Register
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className={`md:hidden p-2 text-text-secondary hover:text-text-primary ${focusRingClasses} rounded`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div
        id="mobile-menu"
        className={`md:hidden ${mobileMenuOpen ? '' : 'hidden'}`}
      >
        <div className="glass-card mx-4 mb-4 p-4">
          <div className="flex flex-col gap-3">
            {isAuthenticated ? (
              <>
                <Link
                  href="/dashboard"
                  className={mobileLinkClasses('/dashboard')}
                  aria-current={isActive('/dashboard') ? 'page' : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  href="/upload"
                  className={mobileLinkClasses('/upload')}
                  aria-current={isActive('/upload') ? 'page' : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Upload
                </Link>
                <Link
                  href="/audit"
                  className={mobileLinkClasses('/audit')}
                  aria-current={isActive('/audit') ? 'page' : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Audit Log
                </Link>
                {user?.isAdmin && (
                  <Link
                    href="/admin"
                    className={mobileLinkClasses('/admin')}
                    aria-current={isActive('/admin') ? 'page' : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Admin
                  </Link>
                )}
                <div className="border-t border-border-glass pt-3 mt-2">
                  <span className="text-sm text-text-secondary">
                    {displayUsername}
                  </span>
                  <button
                    onClick={handleLogout}
                    className={`block mt-2 text-sm text-status-error hover:text-status-error/80 transition-colors ${focusRingClasses} rounded`}
                    aria-label="Logout"
                  >
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className={mobileLinkClasses('/login')}
                  aria-current={isActive('/login') ? 'page' : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className={mobileLinkClasses('/register')}
                  aria-current={isActive('/register') ? 'page' : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
