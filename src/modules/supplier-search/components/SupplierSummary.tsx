import type { SupplierProductResult } from '../../supplier-adapters/SupplierAdapter';
import Badge from '../../../components/ui/Badge';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

type SupplierSummaryProps = {
  results: SupplierProductResult[];
};

export default function SupplierSummary({ results }: SupplierSummaryProps) {
  const totalSuppliers = results.length;
  const totals = results.map((result) => result.totalAmount || 0);
  const lowestPrice = totalSuppliers > 0 ? Math.min(...totals) : 0;
  const highestPrice = totalSuppliers > 0 ? Math.max(...totals) : 0;
  const averagePrice = totalSuppliers > 0 ? totals.reduce((sum, value) => sum + value, 0) / totalSuppliers : 0;
  const bestSupplier = results[0] || null;
  const savingsVsHighest = Math.max(highestPrice - lowestPrice, 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Procurement Insights</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-900">Supplier Summary Card</h3>
        </div>
        {bestSupplier ? (
          <Badge variant="success" size="lg">Best Supplier: {bestSupplier.supplier}</Badge>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Suppliers</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{totalSuppliers}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Lowest Price</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{currencyFormatter.format(lowestPrice)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Average Supplier Price</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{currencyFormatter.format(averagePrice)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Highest Price</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{currencyFormatter.format(highestPrice)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2 xl:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Savings vs Highest Supplier</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-700">{currencyFormatter.format(savingsVsHighest)}</p>
        </div>
      </div>
    </div>
  );
}
