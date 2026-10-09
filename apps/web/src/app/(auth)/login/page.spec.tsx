import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';

const mockLogin = vi.fn();
const mockVerifyMfa = vi.fn();
const mockBootstrap = vi.fn(() => Promise.resolve(false));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({
    login: mockLogin,
    verifyMfa: mockVerifyMfa,
    bootstrap: mockBootstrap,
    logoutReason: null,
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders email and password fields', async () => {
    render(<LoginPage />);
    expect(await screen.findByLabelText(/correo electrónico/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^contraseña$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('validates the email before calling the API', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(await screen.findByLabelText(/correo electrónico/i), 'not-an-email');
    await user.type(screen.getByLabelText(/^contraseña$/i), 'x');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByText(/correo electrónico inválido/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('requires a password', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(await screen.findByLabelText(/correo electrónico/i), 'valid@test.com');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByText(/la contraseña es requerida/i)).toBeInTheDocument();
  });

  it('calls login with the credentials', async () => {
    mockLogin.mockResolvedValueOnce({ requiresMfa: false });
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(await screen.findByLabelText(/correo electrónico/i), 'admin@test.com');
    await user.type(screen.getByLabelText(/^contraseña$/i), 'Secret123');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('admin@test.com', 'Secret123', undefined));
  });

  it('shows the API error message inline', async () => {
    mockLogin.mockRejectedValueOnce({ response: { data: { message: 'Credenciales inválidas' } } });
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(await screen.findByLabelText(/correo electrónico/i), 'admin@test.com');
    await user.type(screen.getByLabelText(/^contraseña$/i), 'bad');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas');
  });

  it('asks for the company code when the email exists in several companies', async () => {
    mockLogin.mockRejectedValueOnce({ response: { data: { message: 'Indica el código', code: 'TENANT_REQUIRED' } } });
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(await screen.findByLabelText(/correo electrónico/i), 'admin@test.com');
    await user.type(screen.getByLabelText(/^contraseña$/i), 'Secret123');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByLabelText(/código de la empresa/i)).toBeInTheDocument();
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    const input = await screen.findByLabelText(/^contraseña$/i);
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: /mostrar contraseña/i }));
    expect(input).toHaveAttribute('type', 'text');
  });

  it('switches to the MFA step and verifies the code with the MFA token', async () => {
    mockLogin.mockResolvedValueOnce({ requiresMfa: true, mfaToken: 'mfa-123' });
    mockVerifyMfa.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(await screen.findByLabelText(/correo electrónico/i), 'admin@test.com');
    await user.type(screen.getByLabelText(/^contraseña$/i), 'Secret123');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    const code = await screen.findByLabelText(/código de verificación/i);
    await user.type(code, '123456');
    await user.click(screen.getByRole('button', { name: /verificar/i }));
    await waitFor(() => expect(mockVerifyMfa).toHaveBeenCalledWith('123456', 'mfa-123'));
  });

  it('returns from the MFA step to the login form', async () => {
    mockLogin.mockResolvedValueOnce({ requiresMfa: true, mfaToken: 'mfa-123' });
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(await screen.findByLabelText(/correo electrónico/i), 'admin@test.com');
    await user.type(screen.getByLabelText(/^contraseña$/i), 'Secret123');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    await user.click(await screen.findByRole('button', { name: /volver/i }));
    expect(await screen.findByLabelText(/correo electrónico/i)).toBeInTheDocument();
  });
});
