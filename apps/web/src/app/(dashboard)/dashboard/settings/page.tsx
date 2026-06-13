'use client';

import { useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Settings, Building2, User, Moon, Sun, Monitor } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';

type Company = {
  id: string;
  name: string;
  legalName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  taxId?: string;
  currency?: string;
  plan?: { name: string };
};

const companySchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  legalName: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
  taxId: z.string().optional(),
  currency: z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Ingresa tu contraseña actual'),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres'),
  confirmPassword: z.string().min(1, 'Confirma la contraseña'),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

type CompanyForm = z.infer<typeof companySchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { theme, setTheme } = useUiStore();

  const { data: company, isLoading } = useQuery<Company>({
    queryKey: ['company-me'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/companies/me');
        return data.data ?? data;
      } catch {
        return null;
      }
    },
  });

  const companyForm = useForm<CompanyForm>({
    resolver: zodResolver(companySchema),
    defaultValues: { name: '', legalName: '', email: '', phone: '', website: '', address: '', taxId: '', currency: 'COP' },
  });

  useEffect(() => {
    if (company) {
      companyForm.reset({
        name: company.name ?? '',
        legalName: company.legalName ?? '',
        email: company.email ?? '',
        phone: company.phone ?? '',
        website: company.website ?? '',
        address: company.address ?? '',
        taxId: company.taxId ?? '',
        currency: company.currency ?? 'COP',
      });
    }
  }, [company]);

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const updateCompanyMutation = useMutation({
    mutationFn: (body: CompanyForm) => apiClient.patch('/companies/me', body),
    onSuccess: () => toast({ title: 'Empresa actualizada correctamente' }),
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast({ variant: 'destructive', title: e.response?.data?.message ?? 'Error al actualizar la empresa' }),
  });

  const changePasswordMutation = useMutation({
    mutationFn: (body: PasswordForm) => apiClient.post('/auth/change-password', body),
    onSuccess: () => {
      toast({ title: 'Contraseña cambiada correctamente' });
      passwordForm.reset();
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast({ variant: 'destructive', title: e.response?.data?.message ?? 'Error al cambiar la contraseña' }),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" /> Configuración
        </h2>
        <p className="text-muted-foreground text-sm">Gestiona la configuración de tu empresa y cuenta</p>
      </div>

      {/* Empresa */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" /> Información de la empresa
          </CardTitle>
          {company?.plan && (
            <CardDescription>Plan actual: <strong>{company.plan.name}</strong></CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : (
            <form onSubmit={companyForm.handleSubmit((d) => updateCompanyMutation.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Nombre comercial *</Label>
                  <Input {...companyForm.register('name')} placeholder="Mi Empresa S.A.S." />
                  {companyForm.formState.errors.name && (
                    <p className="text-xs text-destructive">{companyForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Razón social</Label>
                  <Input {...companyForm.register('legalName')} placeholder="Mi Empresa S.A.S." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>NIT / RUT</Label>
                  <Input {...companyForm.register('taxId')} placeholder="900.123.456-7" />
                </div>
                <div className="space-y-1">
                  <Label>Moneda</Label>
                  <Input {...companyForm.register('currency')} placeholder="COP, USD, EUR..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" {...companyForm.register('email')} placeholder="info@empresa.com" />
                  {companyForm.formState.errors.email && (
                    <p className="text-xs text-destructive">{companyForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Teléfono</Label>
                  <Input {...companyForm.register('phone')} placeholder="+57 1 234 5678" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Dirección</Label>
                <Input {...companyForm.register('address')} placeholder="Calle 123 #45-67, Ciudad" />
              </div>
              <div className="space-y-1">
                <Label>Sitio web</Label>
                <Input {...companyForm.register('website')} placeholder="https://miempresa.com" />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={updateCompanyMutation.isPending}>
                  {updateCompanyMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Apariencia */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Monitor className="h-4 w-4" /> Apariencia
          </CardTitle>
          <CardDescription>Personaliza cómo se ve la interfaz</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <Label>Tema</Label>
            <div className="flex gap-2 mt-2">
              {([
                { value: 'light', label: 'Claro', icon: Sun },
                { value: 'dark', label: 'Oscuro', icon: Moon },
                { value: 'system', label: 'Sistema', icon: Monitor },
              ] as const).map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  variant={theme === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTheme(value)}
                  className="gap-2"
                >
                  <Icon className="h-4 w-4" /> {label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cuenta */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" /> Mi cuenta
          </CardTitle>
          <CardDescription>
            {user?.email} · {user?.firstName} {user?.lastName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Separator className="mb-4" />
          <p className="text-sm font-medium mb-3">Cambiar contraseña</p>
          <form onSubmit={passwordForm.handleSubmit((d) => changePasswordMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>Contraseña actual</Label>
              <Input type="password" {...passwordForm.register('currentPassword')} />
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-xs text-destructive">{passwordForm.formState.errors.currentPassword.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nueva contraseña</Label>
                <Input type="password" {...passwordForm.register('newPassword')} />
                {passwordForm.formState.errors.newPassword && (
                  <p className="text-xs text-destructive">{passwordForm.formState.errors.newPassword.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Confirmar contraseña</Label>
                <Input type="password" {...passwordForm.register('confirmPassword')} />
                {passwordForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-destructive">{passwordForm.formState.errors.confirmPassword.message}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="outline" disabled={changePasswordMutation.isPending}>
                {changePasswordMutation.isPending ? 'Cambiando…' : 'Cambiar contraseña'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
