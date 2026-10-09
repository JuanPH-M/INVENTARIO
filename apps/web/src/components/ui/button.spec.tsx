import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders label text', () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });

  it('calls onClick handler', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>Enviar</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.className).toContain('disabled:opacity-50');
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies destructive variant classes', () => {
    render(<Button variant="destructive" data-testid="btn">Eliminar</Button>);
    expect(screen.getByTestId('btn').className).toContain('bg-destructive');
  });

  it('applies ghost variant classes', () => {
    render(<Button variant="ghost" data-testid="btn">Ghost</Button>);
    expect(screen.getByTestId('btn').className).toContain('hover:bg-muted');
  });

  it('applies sm size classes', () => {
    render(<Button size="sm" data-testid="btn">Small</Button>);
    expect(screen.getByTestId('btn').className).toContain('h-9');
  });

  it('applies icon size classes', () => {
    render(<Button size="icon" data-testid="btn">+</Button>);
    expect(screen.getByTestId('btn').className).toContain('h-9 w-9');
  });

  it('renders as child element with asChild=true', () => {
    render(
      <Button asChild>
        <a href="/test">Link Button</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Link Button' });
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
  });

  it('merges custom className', () => {
    render(<Button className="my-custom-class" data-testid="btn">Test</Button>);
    expect(screen.getByTestId('btn').className).toContain('my-custom-class');
  });
});
