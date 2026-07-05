'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, getApiError } from '@/lib/api';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
  createdAt?: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface LoginParams {
  email: string;
  password: string;
}

interface RegisterParams {
  email: string;
  username: string;
  password: string;
}

interface AuthError {
  error: string;
  message: string;
}

export function useAuth() {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Fetch current user on mount
  const fetchUser = useCallback(async () => {
    try {
      const response = await api.get('/auth/me');
      setState({
        user: response.data,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(
    async (params: LoginParams): Promise<{ success: boolean; error?: AuthError }> => {
      try {
        await api.post('/auth/login', params);
        await fetchUser();
        return { success: true };
      } catch (err) {
        const apiError = getApiError(err);
        return {
          success: false,
          error: { error: apiError.error, message: apiError.message },
        };
      }
    },
    [fetchUser]
  );

  const register = useCallback(
    async (params: RegisterParams): Promise<{ success: boolean; error?: AuthError }> => {
      try {
        await api.post('/auth/register', params);
        await fetchUser();
        return { success: true };
      } catch (err) {
        const apiError = getApiError(err);
        return {
          success: false,
          error: { error: apiError.error, message: apiError.message },
        };
      }
    },
    [fetchUser]
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Logout even if API call fails
    }
    setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
    router.push('/login');
  }, [router]);

  return {
    ...state,
    login,
    register,
    logout,
    refetch: fetchUser,
  };
}
