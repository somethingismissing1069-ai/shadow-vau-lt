'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Key, Mail, User, Calendar } from 'lucide-react';
import { Card, LoadingSpinner } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';

export default function SettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <main className="min-h-screen pt-20 pb-12 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">Settings</h1>
          <p className="text-text-secondary">
            Manage your account profile and encryption keys
          </p>
        </div>

        {/* Profile Section */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-text-accent/10">
              <User className="h-5 w-5 text-text-accent" />
            </div>
            <h2 className="text-xl font-semibold text-text-primary">Profile</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email
              </label>
              <div className="glass-input bg-bg-secondary/50 cursor-default">
                {user.email}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
                <User className="h-4 w-4" />
                Username
              </label>
              <div className="glass-input bg-bg-secondary/50 cursor-default">
                {user.username}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Account Created
              </label>
              <div className="glass-input bg-bg-secondary/50 cursor-default">
                {user.createdAt
                  ? new Date(user.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'N/A'}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Role
              </label>
              <div className="glass-input bg-bg-secondary/50 cursor-default">
                {user.isAdmin ? 'Administrator' : 'User'}
              </div>
            </div>
          </div>
        </Card>

        {/* Encryption Key Info */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-status-success/10">
              <Key className="h-5 w-5 text-status-success" />
            </div>
            <h2 className="text-xl font-semibold text-text-primary">
              Encryption Key
            </h2>
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-bg-secondary/30 border border-border-glass">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-text-secondary">
                  RSA-4096 Key Pair
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-status-success/10 text-status-success border border-status-success/30">
                  Active
                </span>
              </div>
              <p className="text-sm text-text-secondary">
                Your RSA-4096 key pair is used to encrypt and decrypt files. The
                private key is encrypted with your password and stored securely.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-text-secondary">
                  Key Type
                </label>
                <div className="glass-input bg-bg-secondary/50 cursor-default text-sm">
                  RSA-4096 (OAEP-SHA256)
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-text-secondary">
                  Private Key Storage
                </label>
                <div className="glass-input bg-bg-secondary/50 cursor-default text-sm">
                  AES-256-GCM Encrypted
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-status-info/5 border border-status-info/20">
              <p className="text-xs text-status-info">
                Your private key is encrypted with a key derived from your
                password. If you change your password, the private key will be
                re-encrypted automatically.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
