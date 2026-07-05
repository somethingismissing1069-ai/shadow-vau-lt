'use client';

import Link from 'next/link';
import { Shield, Menu, X } from 'lucide-react';
import { useState } from 'react';

interface NavbarProps {
  isAuthenticated?: boolean;
  username?: string;
}

export function Navbar({ isAuthenticated = false, username }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="glass-navbar fixed top-0 left-0 right-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
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
                  className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  href="/upload"
                  className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  Upload
                </Link>
                <Link
                  href="/audit"
                  className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  Audit Logs
                </Link>
                <Link
                  href="/settings"
                  className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  Settings
                </Link>
                <div className="flex items-center gap-3 pl-4 border-l border-border-glass">
                  <span className="text-sm text-text-secondary">{username}</span>
                  <Link
                    href="/api/auth/logout"
                    className="text-sm text-status-error hover:text-status-error/80 transition-colors"
                  >
                    Logout
                  </Link>
                </div>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-text-accent hover:bg-text-accent/80 rounded-xl border border-text-accent/50 transition-all"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-text-secondary hover:text-text-primary"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden glass-card mx-4 mb-4 p-4">
          <div className="flex flex-col gap-3">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard" className="text-sm text-text-secondary hover:text-text-primary py-2">
                  Dashboard
                </Link>
                <Link href="/upload" className="text-sm text-text-secondary hover:text-text-primary py-2">
                  Upload
                </Link>
                <Link href="/audit" className="text-sm text-text-secondary hover:text-text-primary py-2">
                  Audit Logs
                </Link>
                <Link href="/settings" className="text-sm text-text-secondary hover:text-text-primary py-2">
                  Settings
                </Link>
                <div className="border-t border-border-glass pt-3 mt-2">
                  <span className="text-sm text-text-secondary">{username}</span>
                </div>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm text-text-secondary hover:text-text-primary py-2">
                  Login
                </Link>
                <Link href="/register" className="text-sm text-text-accent hover:text-text-accent/80 py-2">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
