'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'Mínimo 8 caracteres')
      .regex(/[a-z]/, 'Incluye una minúscula')
      .regex(/[A-Z]/, 'Incluye una mayúscula')
      .regex(/\d/, 'Incluye un número'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'Las contraseñas no coinciden' });
type FormData = z.infer<typeof schema>;

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : 'El enlace no es válido.');
  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError(null);
    try {
      await apiClient.post('/auth/reset-password', { token, newPassword: data.password });
      setDone(true);
    } catch (err) {
      setError(getErrorMessage(err, 'El enlace es inválido o ya expiró'));
    }
  };

  if (done) {
    return (
      <div>
        <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-success/10 text-success">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Contraseña actualizada</h1>
        <p className="mt-2 text-sm text-muted-foreground">Por seguridad cerramos tus otras sesiones. Ya puedes ingresar.</p>
        <Button asChild className="accessible-button mt-8 w-full">
          <Link href="/login">Iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Crea una nueva contraseña</h1>
      <p className="mt-2 text-sm text-muted-foreground">Usa al menos 8 caracteres con mayúsculas, minúsculas y números.</p>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="password">Nueva contraseña</Label>
          <Input id="password" type="password" autoComplete="new-password" className="h-11" {...form.register('password')} />
          {form.formState.errors.password && <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmar contraseña</Label>
          <Input id="confirm" type="password" autoComplete="new-password" className="h-11" {...form.register('confirm')} />
          {form.formState.errors.confirm && <p className="text-xs text-destructive">{form.formState.errors.confirm.message}</p>}
        </div>
        <Button type="submit" className="accessible-button w-full" disabled={!token || form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Guardar contraseña
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
