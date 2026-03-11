import type { SupplierProductResult } from '../../supplier-adapters/SupplierAdapter';
import Badge from '../../../components/ui/Badge';
import BestSupplierBadge from './BestSupplierBadge';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

type EditableField = 'quantity' | 'price' | 'discountPercent' | 'taxPercent';

type SupplierRowProps = {
  result: SupplierProductResult;
  mobile?: boolean;
  onEditField: (productId: string, supplier: string, field: EditableField, value: number) => void;
  onSupplierClick?: (quote: SupplierProductResult) => void;
  onUseQuote: (quote: SupplierProductResult) => void;
  onAddToInvoice: (quote: SupplierProductResult) => void;
  onCreatePurchaseOrder: (quote: SupplierProductResult) => void;
};

const sourceLabelMap = {
  mock: 'Demo',
  hybrid: 'Hybrid',
  database: 'Supabase',
} as const;

export default function SupplierRow({
  result,
  mobile = false,
  onEditField,
  onSupplierClick,
  onUseQuote,
  onAddToInvoice,
  onCreatePurchaseOrder,
}: SupplierRowProps) {
  const rowClassName = result.isBestPrice
    ? 'border-emerald-200 bg-emerald-50/60'
    : 'border-slate-200 bg-white';

  const sourceLabel = sourceLabelMap[result.source || 'database'] || 'Supabase';

  const controls = (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => onUseQuote(result)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700">
        Use Quote
      </button>
      <button onClick={() => onAddToInvoice(result)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200">
        Add to Invoice
      </button>
      <button onClick={() => onCreatePurchaseOrder(result)} className="rounded-lg bg-emerald-100 px-3 py-2 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-200">
        Create PO
      </button>
    </div>
  );

  const editableInputClassName = 'w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

  if (mobile) {
    return (
      <div className={`rounded-2xl border p-4 shadow-sm ${rowClassName}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-slate-900">{result.rankLabel || `#${result.rank || '-'}`}</span>
              <button type="button" onClick={() => onSupplierClick?.(result)} className={`text-base font-semibold ${onSupplierClick ? 'text-blue-700 hover:text-blue-900 hover:underline' : 'text-slate-900'} transition-colors`}>
                {result.supplier}
              </button>
              <BestSupplierBadge visible={!!result.isBestPrice} />
            </div>
            <p className="mt-1 text-sm text-slate-500">{result.location}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Badge variant="neutral" size="sm">{sourceLabel}</Badge>
              <Badge variant="info" size="sm">{result.category}</Badge>
              {result.isFastestDelivery ? <Badge variant="warning" size="sm">Fast Delivery</Badge> : null}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total Amount</p>
            <p className="text-xl font-semibold text-slate-900">{currencyFormatter.format(result.totalAmount || 0)}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2 rounded-xl bg-white/80 p-3">
            <p className="font-medium text-slate-900">{result.productName}</p>
            <p className="mt-1 text-xs text-slate-500">Product ID: {result.productId}</p>
            <p className="mt-2 text-xs text-slate-600">{result.description}</p>
          </div>
          <label className="text-slate-600">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide">Quantity</span>
            <input type="number" min="0" value={result.quantity} onChange={(event) => onEditField(result.productId, result.supplier, 'quantity', Number(event.target.value))} className={editableInputClassName} />
          </label>
          <label className="text-slate-600">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide">Unit Price</span>
            <input type="number" min="0" step="0.01" value={result.price} onChange={(event) => onEditField(result.productId, result.supplier, 'price', Number(event.target.value))} className={editableInputClassName} />
          </label>
          <label className="text-slate-600">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide">Discount %</span>
            <input type="number" min="0" step="0.01" value={result.discountPercent} onChange={(event) => onEditField(result.productId, result.supplier, 'discountPercent', Number(event.target.value))} className={editableInputClassName} />
          </label>
          <label className="text-slate-600">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide">Tax %</span>
            <input type="number" min="0" step="0.01" value={result.taxPercent} onChange={(event) => onEditField(result.productId, result.supplier, 'taxPercent', Number(event.target.value))} className={editableInputClassName} />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
          <div className="rounded-xl bg-white/80 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Delivery Time</p>
            <p className="mt-1 font-semibold text-slate-900">{result.delivery}</p>
          </div>
          <div className="rounded-xl bg-white/80 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Tax</p>
            <p className="mt-1 font-semibold text-slate-900">{result.taxPercent}%</p>
          </div>
          <div className="rounded-xl bg-white/80 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Subtotal</p>
            <p className="mt-1 font-semibold text-slate-900">{currencyFormatter.format(result.subtotal || 0)}</p>
          </div>
          <div className="rounded-xl bg-white/80 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Discount Amount</p>
            <p className="mt-1 font-semibold text-emerald-700">{currencyFormatter.format(result.discountAmount || 0)}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4">
          {result.decisionReasons?.length ? (
            <div className="rounded-xl bg-white/80 p-3 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Recommendation Signals</p>
              <ul className="mt-2 space-y-1">
                {result.decisionReasons.map((reason) => (
                  <li key={reason}>- {reason}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {controls}
        </div>
      </div>
    );
  }

  return (
    <tr className={`border-b border-slate-200 transition-colors hover:bg-slate-50 ${result.isBestPrice ? 'bg-emerald-50/60' : 'bg-white'}`}>
      <td className="px-4 py-4 text-sm text-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">{result.rankLabel || `#${result.rank || '-'}`}</span>
          <button type="button" onClick={() => onSupplierClick?.(result)} className={`font-semibold ${onSupplierClick ? 'text-blue-700 hover:text-blue-900 hover:underline' : 'text-slate-900'} transition-colors`}>
            {result.supplier}
          </button>
          <BestSupplierBadge visible={!!result.isBestPrice} />
        </div>
      </td>
      <td className="px-4 py-4 text-sm text-slate-700">{result.location}</td>
      <td className="px-4 py-4 text-sm text-slate-700">
        <div className="font-medium text-slate-900">{result.productName}</div>
        <div className="mt-1 text-xs text-slate-500">SKU {result.sku}</div>
      </td>
      <td className="px-4 py-4 text-sm text-slate-700">{result.productId}</td>
      <td className="px-4 py-4 text-sm text-slate-700">{result.category}</td>
      <td className="px-4 py-4 text-sm text-slate-600 max-w-[260px]">{result.description}</td>
      <td className="px-4 py-4 text-sm text-slate-700">
        <input type="number" min="0" value={result.quantity} onChange={(event) => onEditField(result.productId, result.supplier, 'quantity', Number(event.target.value))} className={editableInputClassName} />
      </td>
      <td className="px-4 py-4 text-sm text-slate-700">
        <input type="number" min="0" step="0.01" value={result.price} onChange={(event) => onEditField(result.productId, result.supplier, 'price', Number(event.target.value))} className={editableInputClassName} />
      </td>
      <td className="px-4 py-4 text-sm text-slate-700">
        <input type="number" min="0" step="0.01" value={result.discountPercent} onChange={(event) => onEditField(result.productId, result.supplier, 'discountPercent', Number(event.target.value))} className={editableInputClassName} />
      </td>
      <td className="px-4 py-4 text-sm text-slate-700">{result.delivery}</td>
      <td className="px-4 py-4 text-sm text-slate-700">
        <input type="number" min="0" step="0.01" value={result.taxPercent} onChange={(event) => onEditField(result.productId, result.supplier, 'taxPercent', Number(event.target.value))} className={editableInputClassName} />
      </td>
      <td className="px-4 py-4 text-right text-sm font-semibold text-slate-900">{currencyFormatter.format(result.totalAmount || 0)}</td>
      <td className="px-4 py-4 text-sm text-slate-600">
        <div className="flex flex-col gap-1">
          <span>{sourceLabel}</span>
          {result.supplierRecord?.exists ? <span className="text-xs text-emerald-700">Supplier linked</span> : <span className="text-xs text-slate-500">Fallback values</span>}
        </div>
      </td>
      <td className="px-4 py-4">{controls}</td>
    </tr>
  );
}
