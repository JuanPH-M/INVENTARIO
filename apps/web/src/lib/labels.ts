/** Etiquetas en español para los valores que devuelve la API. */

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  credit: 'Crédito',
  check: 'Cheque',
  other: 'Otro',
};

type BadgeTone = 'success' | 'warning' | 'destructive' | 'secondary' | 'info' | 'default';

export const SALE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  completed: { label: 'Completada', tone: 'success' },
  pending: { label: 'Saldo pendiente', tone: 'warning' },
  quote: { label: 'Cotización', tone: 'info' },
  voided: { label: 'Anulada', tone: 'destructive' },
  refunded: { label: 'Reembolsada', tone: 'secondary' },
};

export const PURCHASE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Borrador', tone: 'secondary' },
  sent: { label: 'Enviada', tone: 'info' },
  confirmed: { label: 'Confirmada', tone: 'info' },
  partial_received: { label: 'Recibida parcial', tone: 'warning' },
  received: { label: 'Recibida', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'destructive' },
};

export const MOVEMENT_LABELS: Record<string, string> = {
  purchase_in: 'Entrada por compra',
  sale_out: 'Salida por venta',
  adjustment_in: 'Ajuste de entrada',
  adjustment_out: 'Ajuste de salida',
  transfer_in: 'Traslado recibido',
  transfer_out: 'Traslado enviado',
  return_in: 'Devolución',
  return_out: 'Devolución a proveedor',
  damage_out: 'Daño / merma',
  loss_out: 'Pérdida',
  count_adjustment: 'Ajuste por conteo',
  physical_count: 'Conteo físico',
  initial: 'Inventario inicial',
  initial_stock: 'Inventario inicial',
  damage: 'Daño / merma',
  theft: 'Robo / faltante',
  repair_in: 'Regreso de reparación',
  repair_out: 'Envío a reparación',
};

/** Tipos de ajuste manual permitidos por la API (POST /inventory/adjust). */
export const ADJUSTMENT_TYPES: Array<{ value: string; label: string; direction: 1 | -1 }> = [
  { value: 'adjustment_in', label: 'Entrada (ajuste positivo)', direction: 1 },
  { value: 'initial_stock', label: 'Inventario inicial', direction: 1 },
  { value: 'repair_in', label: 'Regreso de reparación', direction: 1 },
  { value: 'adjustment_out', label: 'Salida (ajuste negativo)', direction: -1 },
  { value: 'damage', label: 'Daño / merma', direction: -1 },
  { value: 'theft', label: 'Robo / faltante', direction: -1 },
  { value: 'repair_out', label: 'Envío a reparación', direction: -1 },
];

export const FINANCE_TYPES: Record<string, { label: string; tone: BadgeTone }> = {
  income: { label: 'Ingreso', tone: 'success' },
  expense: { label: 'Egreso', tone: 'destructive' },
  transfer: { label: 'Transferencia', tone: 'info' },
  adjustment: { label: 'Ajuste', tone: 'secondary' },
};

export function label(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return '—';
  return map[value] ?? value.replace(/_/g, ' ');
}
