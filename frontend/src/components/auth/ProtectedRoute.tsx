'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [timedOut, setTimedOut] = useState(false);

  // Max 10 seconds loading timeout — treat as unauthenticated after that
  useEffect(() => {
    if (!isLoading) return;

    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 10000);

    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    // Still loading and hasn't timed out — wait
    if (isLoading && !timedOut) return;

    // Not authenticated (or timed out): store path and redirect to login
    if (!isAuthenticated) {
      sessionStorage.setItem('redirectAfterLogin', pathname);
      router.replace('/login');
      return;
    }

    // Authenticated but admin required and user is not admin
    if (requireAdmin && !user?.isAdmin) {
      router.replace('/dashboard');
      return;
    }
  }, [isAuthenticated, isLoading, timedOut, requireAdmin, user, router, pathname]);

  // Show loading indicator while auth state is pending
  if (isLoading && !timedOut) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-indigo-500" />
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated — render nothing while redirect happens
  if (!isAuthenticated) {
    return null;
  }

  // Admin check failed — render nothing while redirect happens
  if (requireAdmin && !user?.isAdmin) {
    return null;
  }

  return <>{children}</>;
}
