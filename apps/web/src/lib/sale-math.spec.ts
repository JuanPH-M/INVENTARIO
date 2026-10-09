import { describe, it, expect } from 'vitest';
import { calculateLine, calculateSale, round2 } from './sale-math';
import { getErrorMessage } from './api-client';

describe('sale-math', () => {
  it('rounds money without floating point drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });

  it('extracts tax when the price includes it (same as the API)', () => {
    expect(calculateLine({ quantity: 2, unitPrice: 28_900, taxRate: 0.05, taxIncluded: true })).toMatchObject({
      net: 55_047.62,
      tax: 2_752.38,
      total: 57_800,
    });
  });

  it('adds tax on top when the price excludes it', () => {
    expect(calculateLine({ quantity: 1, unitPrice: 100, taxRate: 0.19, taxIncluded: false })).toMatchObject({
      net: 100,
      tax: 19,
      total: 119,
    });
  });

  it('caps line and global discounts', () => {
    const line = calculateLine({ quantity: 1, unitPrice: 10, discount: 50, taxRate: 0, taxIncluded: false });
    expect(line.total).toBe(0);
    const sale = calculateSale([{ quantity: 1, unitPrice: 100, taxRate: 0, taxIncluded: false }], 1_000);
    expect(sale.total).toBe(0);
  });

  it('totals several lines', () => {
    const sale = calculateSale(
      [
        { quantity: 2, unitPrice: 50, taxRate: 0.19, taxIncluded: false },
        { quantity: 1, unitPrice: 119, taxRate: 0.19, taxIncluded: true },
      ],
      10,
    );
    expect(sale).toMatchObject({ subtotal: 200, tax: 38, discount: 10, total: 228 });
  });
});

describe('getErrorMessage', () => {
  it('prefers the first field validation error', () => {
    const err = { response: { data: { message: 'Error de validación', errors: { email: ['Email inválido'] } } } };
    expect(getErrorMessage(err)).toBe('Email inválido');
  });

  it('uses the API message or a fallback', () => {
    expect(getErrorMessage({ response: { data: { message: 'Stock insuficiente' } } })).toBe('Stock insuficiente');
    expect(getErrorMessage({}, 'Falló')).toBe('Falló');
    expect(getErrorMessage({ message: 'Network Error' })).toBe('No hay conexión con el servidor');
  });
});
