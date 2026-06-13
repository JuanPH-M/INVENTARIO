'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, Package2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

const loginSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

const mfaSchema = z.object({
  code: z.string().length(6, 'El código debe tener 6 dígitos'),
});

type LoginFormData = z.infer<typeof loginSchema>;
type MfaFormData = z.infer<typeof mfaSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, verifyMfa } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [mfaStep, setMfaStep] = useState(false);
  const [tempToken, setTempToken] = useState('');

  const loginForm = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });
  const mfaForm = useForm<MfaFormData>({ resolver: zodResolver(mfaSchema) });

  const onLogin = async (data: LoginFormData) => {
    try {
      const result = await login(data.email, data.password);
      if (result.requiresMfa) {
        setTempToken(result.tempToken ?? '');
        setMfaStep(true);
      } else {
        router.replace('/dashboard');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast({ variant: 'destructive', title: 'Error al iniciar sesión', description: msg ?? 'Credenciales incorrectas' });
    }
  };

  const onMfa = async (data: MfaFormData) => {
    try {
      await verifyMfa(data.code, tempToken);
      router.replace('/dashboard');
    } catch {
      toast({ variant: 'destructive', title: 'Código inválido', description: 'El código MFA es incorrecto o expiró' });
    }
  };

  return (
    <>
      <Card className="shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <Package2 className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">{mfaStep ? 'Verificación en dos pasos' : 'Iniciar sesión'}</CardTitle>
          <CardDescription>
            {mfaStep
              ? 'Ingresa el código de 6 dígitos de tu aplicación autenticadora'
              : 'Ingresa tus credenciales para acceder al sistema'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!mfaStep ? (
            <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="usuario@empresa.com"
                  autoComplete="email"
                  {...loginForm.register('email')}
                />
                {loginForm.formState.errors.email && (
                  <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pr-10"
                    {...loginForm.register('password')}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((p) => !p)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {loginForm.formState.errors.password && (
                  <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full accessible-button" disabled={loginForm.formState.isSubmitting}>
                {loginForm.formState.isSubmitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Iniciando sesión...</>
                ) : (
                  'Iniciar sesión'
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={mfaForm.handleSubmit(onMfa)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Código de verificación</Label>
                <Input
                  id="code"
                  placeholder="000000"
                  maxLength={6}
                  className="text-center text-xl tracking-widest"
                  {...mfaForm.register('code')}
                />
                {mfaForm.formState.errors.code && (
                  <p className="text-xs text-destructive">{mfaForm.formState.errors.code.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full accessible-button" disabled={mfaForm.formState.isSubmitting}>
                {mfaForm.formState.isSubmitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Verificando...</>
                ) : (
                  'Verificar'
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setMfaStep(false)}
              >
                Volver
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <Toaster />
    </>
  );
}
