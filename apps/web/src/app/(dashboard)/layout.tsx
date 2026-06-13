'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Toaster } from '@/components/ui/toaster';
import { useAuthStore } from '@/stores/auth.store';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, fetchProfile } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (!user) {
      fetchProfile();
    }
  }, [isAuthenticated, user, fetchProfile, router]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main key={pathname} className="flex-1 overflow-auto p-4 md:p-6 animate-page-in">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
