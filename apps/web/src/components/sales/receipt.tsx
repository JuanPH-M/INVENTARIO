import { formatCurrency, formatDateTime } from '@/lib/utils';
import { PAYMENT_LABELS, label } from '@/lib/labels';
import { BRAND } from '@/config/brand';

export type ReceiptSale = {
  saleNumber: string;
  createdAt: string;
  status?: string;
  subtotal: number | string;
  taxAmount: number | string;
  discount: number | string;
  total: number | string;
  amountPaid?: number | string;
  changeGiven: number | string;
  customerName?: string | null;
  items: Array<{ productName: string; quantity: number | string; unitPrice: number | string; subtotal: number | string; discount?: number | string }>;
  payments: Array<{ type: string; amount: number | string }>;
};

/** Comprobante de venta en formato de tirilla (80 mm), listo para imprimir. */
export function Receipt({
  sale,
  companyName,
  branchName,
  cashier,
}: {
  sale: ReceiptSale;
  companyName?: string;
  branchName?: string;
  cashier?: string;
}) {
  const n = (v: number | string | undefined) => Number(v ?? 0);
  return (
    <div className="mx-auto w-full max-w-[320px] rounded-lg border bg-white p-5 font-mono text-[12px] leading-relaxed text-slate-900" data-print-area>
      <div className="text-center">
        <p className="text-sm font-bold uppercase">{companyName ?? BRAND.name}</p>
        {branchName && <p>{branchName}</p>}
        <p className="mt-1">Comprobante de venta</p>
        <p className="font-bold">N.º {sale.saleNumber}</p>
        <p>{formatDateTime(sale.createdAt)}</p>
        {cashier && <p>Atendió: {cashier}</p>}
        <p>Cliente: {sale.customerName || 'Consumidor final'}</p>
      </div>
      <div className="my-3 border-t border-dashed border-slate-400" />
      {sale.items.map((item, i) => (
        <div key={i} className="mb-1.5">
          <p className="truncate">{item.productName}</p>
          <div className="flex justify-between">
            <span>
              {n(item.quantity)} × {formatCurrency(n(item.unitPrice))}
              {n(item.discount) > 0 && ` (-${formatCurrency(n(item.discount))})`}
            </span>
            <span>{formatCurrency(n(item.subtotal))}</span>
          </div>
        </div>
      ))}
      <div className="my-3 border-t border-dashed border-slate-400" />
      <Row label="Base gravable" value={formatCurrency(n(sale.subtotal))} />
      <Row label="Impuestos" value={formatCurrency(n(sale.taxAmount))} />
      {n(sale.discount) > 0 && <Row label="Descuento" value={`-${formatCurrency(n(sale.discount))}`} />}
      <div className="mt-1 flex justify-between text-sm font-bold">
        <span>TOTAL</span>
        <span>{formatCurrency(n(sale.total))}</span>
      </div>
      <div className="my-3 border-t border-dashed border-slate-400" />
      {sale.payments.map((p, i) => (
        <Row key={i} label={label(PAYMENT_LABELS, p.type)} value={formatCurrency(n(p.amount))} />
      ))}
      {n(sale.changeGiven) > 0 && <Row label="Cambio" value={formatCurrency(n(sale.changeGiven))} />}
      {sale.status === 'voided' && <p className="mt-2 text-center font-bold">*** VENTA ANULADA ***</p>}
      <p className="mt-4 text-center">¡Gracias por su compra!</p>
    </div>
  );
}

function Row({ label: text, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{text}</span>
      <span>{value}</span>
    </div>
  );
}
