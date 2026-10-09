'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({ email: z.string().trim().email('Correo electrónico inválido') });
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async ({ email }: FormData) => {
    setError(null);
    try {
      await apiClient.post('/auth/forgot-password', { email });
      setSentTo(email);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (sentTo) {
    return (
      <div>
        <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-success/10 text-success">
          <MailCheck className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Revisa tu correo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Si <span className="font-medium text-foreground">{sentTo}</span> está registrado, recibirás un enlace para crear una
          nueva contraseña. El enlace vence en 60 minutos.
        </p>
        <Button asChild variant="outline" className="mt-8 w-full">
          <Link href="/login">
            <ArrowLeft /> Volver al inicio de sesión
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">¿Olvidaste tu contraseña?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Escribe tu correo y te enviaremos un enlace para restablecerla.
      </p>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input id="email" type="email" autoFocus autoComplete="email" className="h-11" {...form.register('email')} />
          {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
        </div>
        <Button type="submit" className="accessible-button w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Enviar enlace
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/login">
            <ArrowLeft /> Volver
          </Link>
        </Button>
      </form>
    </div>
  );
}
