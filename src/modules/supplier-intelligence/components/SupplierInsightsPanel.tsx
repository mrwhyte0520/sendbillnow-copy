import type { SupplierProductResult } from '../../supplier-adapters/SupplierAdapter';
import Badge from '../../../components/ui/Badge';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

type SupplierInsightsPanelProps = {
  suppliers: SupplierProductResult[];
};

export default function SupplierInsightsPanel({ suppliers }: SupplierInsightsPanelProps) {
  return (
    <div className="w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Supplier Insights</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Purchase History Panel</h3>
        </div>
        <Badge variant="neutral" size="sm">Suppliers: {suppliers.length}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {suppliers.map((supplier) => (
          <div key={`${supplier.supplier}-${supplier.productId}-insight`} className="w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-base font-semibold text-slate-900">{supplier.supplier}</h4>
                <p className="mt-1 text-sm text-slate-500">{supplier.location}</p>
              </div>
              <Badge variant="info" size="sm">AI Score {Math.round(supplier.aiScore || 0)}</Badge>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="w-full rounded-lg bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Total Orders</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{supplier.totalOrders || 0}</p>
              </div>
              <div className="w-full rounded-lg bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Total Spend</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{currencyFormatter.format(supplier.totalSpend || 0)}</p>
              </div>
              <div className="w-full rounded-lg bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Avg Delivery</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{(supplier.averageDeliveryDays || supplier.deliveryDays || 0).toFixed(1)} days</p>
              </div>
              <div className="w-full rounded-lg bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Reliability</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{Math.round(supplier.reliabilityPercent || 0)}%</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
