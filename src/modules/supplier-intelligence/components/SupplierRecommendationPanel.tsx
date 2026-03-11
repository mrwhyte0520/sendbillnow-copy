import type { SupplierProductResult } from '../../supplier-adapters/SupplierAdapter';
import Badge from '../../../components/ui/Badge';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

type SupplierRecommendationPanelProps = {
  supplier: SupplierProductResult | null;
};

export default function SupplierRecommendationPanel({ supplier }: SupplierRecommendationPanelProps) {
  return (
    <div className="w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <Badge variant="info" size="sm">AI Recommended Supplier</Badge>
      <h3 className="mt-1 text-lg font-semibold text-slate-900">Recommendation Engine</h3>
      {supplier ? (
        <div className="mt-4 space-y-4">
          <div className="w-full max-w-full overflow-hidden rounded-xl border border-violet-200 bg-violet-50 p-4">
            <Badge variant="info" size="sm">Recommended Supplier</Badge>
            <p className="mt-1 text-lg font-semibold text-slate-900">{supplier.supplier}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="w-full rounded-lg bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Price</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{currencyFormatter.format(supplier.price || 0)}</p>
            </div>
            <div className="w-full rounded-lg bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Delivery</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{supplier.delivery || `${supplier.deliveryDays || 0}d`}</p>
            </div>
            <div className="w-full rounded-lg bg-slate-50 p-3 sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">AI Score</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{Math.round(supplier.aiScore || 0)}</p>
            </div>
          </div>
          <p className="text-sm leading-6 text-slate-600">Recommended because it offers the best balance between price, delivery speed and supplier reliability.</p>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No recommendation available yet.</div>
      )}
    </div>
  );
}
