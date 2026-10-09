import type { Metadata } from 'next';
import { BarChart3, Building2, ShieldCheck, Sparkles } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { BRAND } from '@/config/brand';

export const metadata: Metadata = { title: 'Acceso' };

const HIGHLIGHTS = [
  { icon: Building2, title: 'Todas tus sedes conectadas', text: 'Inventario, caja y ventas de cada tienda en tiempo real.' },
  { icon: Sparkles, title: 'Pronósticos inteligentes', text: 'Sabe qué productos se agotarán y cuánto reponer.' },
  { icon: BarChart3, title: 'Decisiones con datos', text: 'Analíticas, reportes PDF/Excel y auditoría completa.' },
  { icon: ShieldCheck, title: 'Seguridad empresarial', text: 'Roles granulares, doble factor y sesiones cifradas.' },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            background:
              'radial-gradient(60rem 30rem at 0% 0%, hsl(var(--primary) / 0.55), transparent 60%), radial-gradient(40rem 30rem at 100% 100%, hsl(172 66% 40% / 0.35), transparent 60%)',
          }}
        />
        <div className="relative">
          <Logo inverted />
        </div>
        <div className="relative max-w-lg">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">
            Controla tu negocio,
            <br />
            <span className="text-indigo-300">sede por sede.</span>
          </h2>
          <p className="mt-4 text-base text-slate-300">{BRAND.tagline}.</p>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <h.icon className="h-[18px] w-[18px] text-indigo-200" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{h.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-slate-400">{h.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">{BRAND.name} · Plataforma de gestión empresarial</p>
      </aside>

      <main className="flex items-center justify-center bg-background px-4 pb-16 pt-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
