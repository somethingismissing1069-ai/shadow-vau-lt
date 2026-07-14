'use client';

import { createContext, useContext, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiError } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type {
  AuthContextValue,
  AuthUser,
  LoginParams,
  RegisterParams,
  AuthResult,
} from '@/types';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data: user = null, isLoading } = useQuery<AuthUser | null>({
    queryKey: queryKeys.auth.me,
    queryFn: async () => {
      try {
        const response = await api.get('/auth/me', { timeout: 5000 });
        return response.data.user ?? response.data;
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
  });

  const loginMutation = useMutation({
    mutationFn: async (params: LoginParams) => {
      const response = await api.post('/auth/login', params);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (params: RegisterParams) => {
      const response = await api.post('/auth/register', params);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout');
    },
    onSettled: () => {
      queryClient.setQueryData(queryKeys.auth.me, null);
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
    },
  });

  const login = useCallback(
    async (params: LoginParams): Promise<AuthResult> => {
      try {
        await loginMutation.mutateAsync(params);
        return { success: true };
      } catch (error: unknown) {
        const apiError = getApiError(error);
        return {
          success: false,
          error: { error: apiError.error, message: apiError.message },
        };
      }
    },
    [loginMutation]
  );

  const register = useCallback(
    async (params: RegisterParams): Promise<AuthResult> => {
      try {
        await registerMutation.mutateAsync(params);
        return { success: true };
      } catch (error: unknown) {
        const apiError = getApiError(error);
        return {
          success: false,
          error: { error: apiError.error, message: apiError.message },
        };
      }
    },
    [registerMutation]
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // Regardless of API success/failure, auth state is cleared in onSettled
    }
  }, [logoutMutation]);

  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
