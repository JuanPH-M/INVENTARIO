'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowLeft, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { getErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const loginSchema = z.object({
  email: z.string().trim().email('Correo electrónico inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
  tenantSlug: z.string().trim().optional(),
});

const mfaSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^(\d{6}|[a-f0-9]{8})$/i, 'Ingresa el código de 6 dígitos o un código de respaldo'),
});

type LoginFormData = z.infer<typeof loginSchema>;
type MfaFormData = z.infer<typeof mfaSchema>;

function safeNext(value: string | null): string {
  return value && value.startsWith('/dashboard') ? value : '/dashboard';
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const { login, verifyMfa, bootstrap, logoutReason } = useAuthStore();

  const [showPassword, setShowPassword] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [needsTenant, setNeedsTenant] = useState(false);
  const [error, setError] = useState<string | null>(logoutReason);

  const loginForm = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });
  const mfaForm = useForm<MfaFormData>({ resolver: zodResolver(mfaSchema) });

  // Si ya hay una sesión válida (cookie), entra directamente
  useEffect(() => {
    let active = true;
    void bootstrap().then((ok) => {
      if (ok && active) router.replace(next);
    });
    return () => {
      active = false;
    };
  }, [bootstrap, next, router]);

  const onLogin = async (data: LoginFormData) => {
    setError(null);
    try {
      const result = await login(data.email, data.password, data.tenantSlug || undefined);
      if (result.requiresMfa && result.mfaToken) {
        setMfaToken(result.mfaToken);
        return;
      }
      router.replace(next);
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === 'TENANT_REQUIRED') setNeedsTenant(true);
      setError(getErrorMessage(err, 'No fue posible iniciar sesión'));
    }
  };

  const onMfa = async (data: MfaFormData) => {
    if (!mfaToken) return;
    setError(null);
    try {
      await verifyMfa(data.code, mfaToken);
      router.replace(next);
    } catch (err) {
      setError(getErrorMessage(err, 'El código es incorrecto o expiró'));
    }
  };

  if (mfaToken) {
    return (
      <div>
        <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Verificación en dos pasos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ingresa el código de 6 dígitos de tu aplicación autenticadora o uno de tus códigos de respaldo.
        </p>

        {error && <FormAlert message={error} />}

        <form onSubmit={mfaForm.handleSubmit(onMfa)} className="mt-6 space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="code">Código de verificación</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              maxLength={8}
              className="h-12 text-center text-xl tracking-[0.5em]"
              {...mfaForm.register('code')}
            />
            {mfaForm.formState.errors.code && (
              <p className="text-xs text-destructive">{mfaForm.formState.errors.code.message}</p>
            )}
          </div>
          <Button type="submit" className="accessible-button w-full" disabled={mfaForm.formState.isSubmitting}>
            {mfaForm.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Verificar
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setMfaToken(null);
              setError(null);
            }}
          >
            <ArrowLeft /> Volver
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Bienvenido de nuevo</h1>
      <p className="mt-2 text-sm text-muted-foreground">Ingresa tus credenciales para acceder a tu empresa.</p>

      {error && <FormAlert message={error} />}

      <form onSubmit={loginForm.handleSubmit(onLogin)} className="mt-6 space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input
            id="email"
            type="email"
            placeholder="usuario@empresa.com"
            autoComplete="email"
            autoFocus
            className="h-11"
            {...loginForm.register('email')}
          />
          {loginForm.formState.errors.email && (
            <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              className="h-11 pr-10"
              {...loginForm.register('password')}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((p) => !p)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {loginForm.formState.errors.password && (
            <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>
          )}
        </div>

        {needsTenant && (
          <div className="space-y-2">
            <Label htmlFor="tenantSlug">Código de la empresa</Label>
            <Input id="tenantSlug" placeholder="mi-empresa" className="h-11" {...loginForm.register('tenantSlug')} />
            <p className="text-xs text-muted-foreground">Tu administrador puede indicarte el código de tu empresa.</p>
          </div>
        )}

        <Button type="submit" className="accessible-button w-full" disabled={loginForm.formState.isSubmitting}>
          {loginForm.formState.isSubmitting && <Loader2 className="animate-spin" />}
          {loginForm.formState.isSubmitting ? 'Iniciando sesión...' : 'Iniciar sesión'}
        </Button>
      </form>

      {process.env.NODE_ENV !== 'production' && (
        <div className="mt-8 rounded-xl border border-dashed bg-muted/40 p-4 text-xs text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground">Cuentas de demostración</p>
          <p>
            Administrador: <span className="font-mono">admin@empresa.com</span> · <span className="font-mono">Demo123!</span>
          </p>
          <p>
            Vendedor: <span className="font-mono">vendedor@empresa.com</span> · <span className="font-mono">Demo123!</span>
          </p>
        </div>
      )}
    </div>
  );
}

function FormAlert({ message }: { message: string }) {
  return (
    <div role="alert" className="mt-5 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
