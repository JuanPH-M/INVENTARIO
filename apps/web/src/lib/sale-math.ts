/**
 * Cálculo de totales de venta. Replica exactamente la lógica del backend
 * (apps/api/.../create-sale.use-case.ts → calculateLine) para que lo que ve el cajero
 * coincida al centavo con lo que se registra.
 */

export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export type LineInput = {
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate: number;
  taxIncluded: boolean;
};

export function calculateLine(input: LineInput) {
  const gross = round2(input.quantity * input.unitPrice);
  const discount = Math.min(round2(input.discount ?? 0), gross);
  const afterDiscount = round2(gross - discount);
  const net = input.taxIncluded ? round2(afterDiscount / (1 + input.taxRate)) : afterDiscount;
  const tax = input.taxIncluded ? round2(afterDiscount - net) : round2(net * input.taxRate);
  return { gross, discount, net, tax, total: round2(net + tax) };
}

export function calculateSale(lines: LineInput[], globalDiscount = 0) {
  const calculated = lines.map(calculateLine);
  const subtotal = round2(calculated.reduce((s, l) => s + l.net, 0));
  const tax = round2(calculated.reduce((s, l) => s + l.tax, 0));
  const lineDiscounts = round2(calculated.reduce((s, l) => s + l.discount, 0));
  const gross = round2(subtotal + tax);
  const discount = Math.min(round2(globalDiscount), gross);
  return { lines: calculated, subtotal, tax, lineDiscounts, discount, total: round2(gross - discount) };
}
