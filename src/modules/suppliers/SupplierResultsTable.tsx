import type { SupplierProductResult } from '../supplier-adapters/SupplierAdapter';
import SupplierTable from '../supplier-search/components/SupplierTable';

type SupplierResultsTableProps = {
  loading: boolean;
  query: string;
  results: SupplierProductResult[];
  error: string;
  onUseQuote: (quote: SupplierProductResult) => void;
  onAddToInvoice: (quote: SupplierProductResult) => void;
  onCreatePurchaseOrder: (quote: SupplierProductResult) => void;
};

export default function SupplierResultsTable({
  loading,
  query,
  results,
  error,
  onUseQuote,
  onAddToInvoice,
  onCreatePurchaseOrder,
}: SupplierResultsTableProps) {
  return (
    <div className="space-y-4">
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Searching supplier catalogs...</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">{error}</div>
      ) : results.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Type a product, supplier, or category to compare procurement offers.</div>
      ) : (
        <SupplierTable
          query={query}
          results={results}
          onUseQuote={onUseQuote}
          onAddToInvoice={onAddToInvoice}
          onCreatePurchaseOrder={onCreatePurchaseOrder}
        />
      )}
    </div>
  );
}
