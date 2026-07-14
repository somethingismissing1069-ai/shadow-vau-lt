'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface PublicRouteProps {
  children: React.ReactNode;
}

export function PublicRoute({ children }: PublicRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  // If already authenticated, render nothing while redirect happens
  if (!isLoading && isAuthenticated) {
    return null;
  }

  // Always render children immediately — don't block login/register forms
  // while checking auth. If user turns out to be authenticated, the useEffect
  // above will redirect them.
  return <>{children}</>;
}
