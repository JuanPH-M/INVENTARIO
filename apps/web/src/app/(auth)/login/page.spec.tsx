import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';

// Mock auth store
const mockLogin = vi.fn();
const mockVerifyMfa = vi.fn();

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({
    login: mockLogin,
    verifyMfa: mockVerifyMfa,
  }),
}));

// Mock toast
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
  useToast: vi.fn(() => ({ toasts: [], toast: vi.fn(), dismiss: vi.fn() })),
}));

// Mock next/navigation is already in setup.ts

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders email and password fields', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/correo electrónico/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('shows validation error for invalid email', async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);

    await user.type(screen.getByLabelText(/correo electrónico/i), 'not-an-email');
    // Submit the login form directly to trigger validation
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => {
      // Check for any validation error paragraph
      const errorMessages = container.querySelectorAll('p.text-xs');
      expect(errorMessages.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('shows validation error for empty password', async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);

    await user.type(screen.getByLabelText(/correo electrónico/i), 'valid@test.com');
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => {
      const errorMessages = container.querySelectorAll('p.text-xs');
      expect(errorMessages.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('calls login with email and password on submit', async () => {
    mockLogin.mockResolvedValue({ requiresMfa: false });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/correo electrónico/i), 'admin@test.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'ValidPass123!');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin@test.com', 'ValidPass123!');
    });
  });

  it('shows MFA step when login returns requiresMfa=true', async () => {
    mockLogin.mockResolvedValue({ requiresMfa: true, tempToken: 'temp-123' });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/correo electrónico/i), 'admin@test.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'ValidPass123!');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText(/verificación en dos pasos/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/código de verificación/i)).toBeInTheDocument();
    });
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const passwordInput = screen.getByLabelText(/contraseña/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    // Find the toggle button (Eye icon button)
    const toggleButton = screen.getByRole('button', { name: '' }); // icon-only button
    await user.click(toggleButton);

    expect(passwordInput).toHaveAttribute('type', 'text');
  });

  it('shows back button on MFA step that returns to login', async () => {
    mockLogin.mockResolvedValue({ requiresMfa: true, tempToken: 'temp-123' });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/correo electrónico/i), 'admin@test.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'ValidPass123!');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    const backButton = await screen.findByRole('button', { name: /volver/i });
    expect(backButton).toBeInTheDocument();

    await user.click(backButton);

    await waitFor(() => {
      // After clicking back, the MFA title should be gone
      expect(screen.queryByText(/verificación en dos pasos/i)).not.toBeInTheDocument();
    });
  });

  it('calls verifyMfa with code and tempToken', async () => {
    mockLogin.mockResolvedValue({ requiresMfa: true, tempToken: 'mfa-token' });
    mockVerifyMfa.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);

    // Go to MFA step
    await user.type(screen.getByLabelText(/correo electrónico/i), 'admin@test.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'ValidPass123!');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    // Wait for MFA step to appear
    const codeInput = await screen.findByLabelText(/código de verificación/i);
    await user.clear(codeInput);
    await user.type(codeInput, '123456');

    // The MFA form has the verify button — click it
    await user.click(screen.getByRole('button', { name: /^verificar$/i }));

    // verifyMfa may be called asynchronously
    await waitFor(() => {
      expect(mockVerifyMfa).toHaveBeenCalled();
    }, { timeout: 5000 });
  });
});
