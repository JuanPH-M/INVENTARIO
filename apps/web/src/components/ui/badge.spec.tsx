import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Activo</Badge>);
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('applies default variant classes', () => {
    render(<Badge data-testid="badge">Test</Badge>);
    const badge = screen.getByTestId('badge');
    expect(badge.className).toContain('bg-primary');
  });

  it('applies success variant classes', () => {
    render(<Badge variant="success" data-testid="badge">OK</Badge>);
    const badge = screen.getByTestId('badge');
    expect(badge.className).toContain('bg-success/10');
  });

  it('applies destructive variant classes', () => {
    render(<Badge variant="destructive" data-testid="badge">Error</Badge>);
    const badge = screen.getByTestId('badge');
    expect(badge.className).toContain('bg-destructive');
  });

  it('applies warning variant classes', () => {
    render(<Badge variant="warning" data-testid="badge">Alerta</Badge>);
    const badge = screen.getByTestId('badge');
    expect(badge.className).toContain('bg-warning/15');
  });

  it('merges custom className', () => {
    render(<Badge className="custom-class" data-testid="badge">Test</Badge>);
    expect(screen.getByTestId('badge').className).toContain('custom-class');
  });
});
