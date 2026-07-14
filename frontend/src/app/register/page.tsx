'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Button, Input, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { PublicRoute } from '@/components/auth/PublicRoute';
import { registerSchema } from '@/lib/schemas';

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerUser } = useAuth();
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
  });

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);
    setIsSubmitting(true);

    const result = await registerUser({
      email: data.email,
      username: data.username,
      password: data.password,
    });

    if (result.success) {
      router.push('/dashboard');
    } else {
      const errorMsg = result.error?.message || 'Unable to connect to server';
      setServerError(errorMsg);
      showToast(errorMsg, 'error');
    }

    setIsSubmitting(false);
  };

  return (
    <PublicRoute>
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-text-primary mb-2">
              Create Account
            </h1>
            <p className="text-text-secondary">
              Join ShadowVault for secure file sharing
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {serverError && (
              <div className="p-3 rounded-lg bg-status-error/10 border border-status-error/30">
                <p className="text-sm text-status-error">{serverError}</p>
              </div>
            )}

            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Username"
              type="text"
              placeholder="your_username"
              error={errors.username?.message}
              {...register('username')}
            />

            <div>
              <Input
                label="Password"
                type="password"
                placeholder="Minimum 12 characters"
                error={errors.password?.message}
                {...register('password')}
              />
              <p className="mt-1 text-xs text-text-secondary">
                Must be at least 12 characters long
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              Create Account
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-text-secondary text-sm">
              Already have an account?{' '}
              <Link
                href="/login"
                className="text-text-accent hover:underline font-medium"
              >
                Sign in
              </Link>
            </p>
          </div>
        </Card>
      </main>
    </PublicRoute>
  );
}
