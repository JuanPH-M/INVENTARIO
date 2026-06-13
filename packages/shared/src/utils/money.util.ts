export function roundMoney(value: number, decimals = 4): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export function calculateTax(amount: number, taxRate: number): number {
  return roundMoney(amount * taxRate);
}

export function calculateDiscount(
  amount: number,
  discountRate: number,
): number {
  return roundMoney(amount * discountRate);
}

export function calculateLineSubtotal(
  quantity: number,
  unitPrice: number,
  taxRate: number,
  discountRate: number,
): { subtotal: number; taxAmount: number; discountAmount: number; total: number } {
  const grossAmount = roundMoney(quantity * unitPrice);
  const discountAmount = calculateDiscount(grossAmount, discountRate);
  const afterDiscount = roundMoney(grossAmount - discountAmount);
  const taxAmount = calculateTax(afterDiscount, taxRate);
  const subtotal = roundMoney(afterDiscount + taxAmount);
  return { subtotal: grossAmount, taxAmount, discountAmount, total: subtotal };
}

export function convertCurrency(
  amount: number,
  rate: number,
): number {
  return roundMoney(amount * rate);
}

export function formatCurrency(
  amount: number,
  currencyCode: string,
  locale = 'es-CO',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
