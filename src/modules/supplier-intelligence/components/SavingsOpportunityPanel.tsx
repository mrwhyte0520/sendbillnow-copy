import Badge from '../../../components/ui/Badge';

type SavingsOpportunityPanelProps = {
  averagePrice: number;
  bestPrice: number;
  savingsPerUnit: number;
  supplierName?: string;
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

export default function SavingsOpportunityPanel({ averagePrice, bestPrice, savingsPerUnit, supplierName }: SavingsOpportunityPanelProps) {
  return (
    <div className="w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <Badge variant="success" size="sm">Savings Comparator</Badge>
      <h3 className="mt-1 text-lg font-semibold text-slate-900">Savings Opportunity Analysis</h3>
      <div className="mt-4 space-y-3">
        <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Average Market Price</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{currencyFormatter.format(averagePrice)}</p>
        </div>
        <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Best Supplier Price</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{currencyFormatter.format(bestPrice)}</p>
          {supplierName ? <p className="mt-1 text-sm text-slate-500">Supplier: {supplierName}</p> : null}
        </div>
        <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <Badge variant="success" size="sm">Potential Savings per Unit</Badge>
          <p className="mt-1 text-lg font-semibold text-emerald-900">{currencyFormatter.format(savingsPerUnit)}</p>
        </div>
      </div>
    </div>
  );
}
