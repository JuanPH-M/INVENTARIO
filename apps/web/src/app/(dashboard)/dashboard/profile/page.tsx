'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Shield, KeyRound, Mail, Globe } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { getInitials } from '@/lib/utils';

const profileSchema = z.object({
  firstName: z.string().min(2, 'Mínimo 2 caracteres'),
  lastName: z.string().min(2, 'Mínimo 2 caracteres'),
  language: z.string().optional(),
  timezone: z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Ingresa tu contraseña actual'),
  newPassword: z.string().min(8, 'Mínimo 8 caracteres'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export default function ProfilePage() {
  const { user, fetchProfile } = useAuthStore();
  const [pwDialogOpen, setPwDialogOpen] = useState(false);

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      language: user?.language ?? 'es',
      timezone: user?.timezone ?? 'America/Bogota',
    },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const updateMutation = useMutation({
    mutationFn: (body: ProfileForm) => apiClient.patch('/auth/profile', body),
    onSuccess: async () => {
      await fetchProfile();
      toast({ title: 'Perfil actualizado' });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      toast({ title: 'Error', description: Array.isArray(msg) ? msg.join(', ') : msg ?? 'No se pudo actualizar', variant: 'destructive' });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (body: PasswordForm) => apiClient.patch('/auth/change-password', body),
    onSuccess: () => {
      passwordForm.reset();
      setPwDialogOpen(false);
      toast({ title: 'Contraseña actualizada' });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      toast({ title: 'Error', description: Array.isArray(msg) ? msg.join(', ') : msg ?? 'Contraseña actual incorrecta', variant: 'destructive' });
    },
  });

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Cargando perfil...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold">Mi perfil</h2>
        <p className="text-muted-foreground text-sm">Gestiona tu información personal y seguridad</p>
      </div>

      {/* Avatar + info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-xl bg-primary text-primary-foreground">
                {getInitials(user.firstName, user.lastName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-semibold">{user.firstName} {user.lastName}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                {user.email}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                <Badge variant="outline" className="capitalize text-xs">
                  {user.role?.replace(/_/g, ' ')}
                </Badge>
                {user.status && (
                  <Badge variant={user.status === 'active' ? 'success' : 'secondary'} className="text-xs">
                    {user.status === 'active' ? 'Activo' : user.status}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            Información personal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit((v) => updateMutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nombre</Label>
                <Input {...profileForm.register('firstName')} />
                {profileForm.formState.errors.firstName && (
                  <p className="text-xs text-destructive">{profileForm.formState.errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Apellido</Label>
                <Input {...profileForm.register('lastName')} />
                {profileForm.formState.errors.lastName && (
                  <p className="text-xs text-destructive">{profileForm.formState.errors.lastName.message}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> Idioma</Label>
                <Input {...profileForm.register('language')} placeholder="es" />
              </div>
              <div className="space-y-1">
                <Label>Zona horaria</Label>
                <Input {...profileForm.register('timezone')} placeholder="America/Bogota" />
              </div>
            </div>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            Cambiar contraseña
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!pwDialogOpen ? (
            <Button variant="outline" onClick={() => setPwDialogOpen(true)}>
              Cambiar contraseña
            </Button>
          ) : (
            <form onSubmit={passwordForm.handleSubmit((v) => passwordMutation.mutate(v))} className="space-y-4">
              <div className="space-y-1">
                <Label>Contraseña actual</Label>
                <Input type="password" {...passwordForm.register('currentPassword')} />
                {passwordForm.formState.errors.currentPassword && (
                  <p className="text-xs text-destructive">{passwordForm.formState.errors.currentPassword.message}</p>
                )}
              </div>
              <Separator />
              <div className="space-y-1">
                <Label>Nueva contraseña</Label>
                <Input type="password" {...passwordForm.register('newPassword')} />
                {passwordForm.formState.errors.newPassword && (
                  <p className="text-xs text-destructive">{passwordForm.formState.errors.newPassword.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Confirmar nueva contraseña</Label>
                <Input type="password" {...passwordForm.register('confirmPassword')} />
                {passwordForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-destructive">{passwordForm.formState.errors.confirmPassword.message}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={passwordMutation.isPending}>
                  {passwordMutation.isPending ? 'Actualizando...' : 'Actualizar contraseña'}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setPwDialogOpen(false); passwordForm.reset(); }}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Permissions list (readonly) */}
      {user.permissions && user.permissions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Mis permisos ({user.permissions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
              {user.permissions.map((p) => (
                <Badge key={p} variant="secondary" className="text-xs font-mono">
                  {p}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
