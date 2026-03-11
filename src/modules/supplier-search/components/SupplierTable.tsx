import { useEffect, useMemo, useState } from 'react';
import { Fragment } from 'react';
import Badge from '../../../components/ui/Badge';
import type { SupplierProductResult } from '../../supplier-adapters/SupplierAdapter';
import { calculateTotals } from '../utils/calculateTotals';
import { getBestSupplier, type SupplierTableSort, rankSuppliers, sortSupplierRows } from '../utils/rankSuppliers';

const PAGE_SIZE = 20;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

type SupplierTableProps = {
  query: string;
  results: SupplierProductResult[];
  markupPercent: number;
  onSupplierClick?: (quote: SupplierProductResult) => void;
  onDeleteQuote?: (quote: SupplierProductResult) => void;
  onUseQuote: (quote: SupplierProductResult) => void;
  onAddToInvoice: (quote: SupplierProductResult) => void;
  onCreatePurchaseOrder: (quote: SupplierProductResult) => void;
};

const buildRowKey = (result: SupplierProductResult) => `${result.supplier}::${result.productId}::${result.sku}`;

export default function SupplierTable({
  query,
  results,
  markupPercent,
  onSupplierClick,
  onDeleteQuote,
}: SupplierTableProps) {
  const [draftResults, setDraftResults] = useState<SupplierProductResult[]>(() => calculateTotals(results));
  const [sortBy, setSortBy] = useState<SupplierTableSort>('aiScore');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  useEffect(() => {
    setDraftResults(calculateTotals(results));
  }, [results]);

  useEffect(() => {
    setCurrentPage(1);
  }, [results, sortBy]);

  useEffect(() => {
    setExpandedProductId(null);
  }, [currentPage, results]);

  const rankedResults = useMemo(() => {
    const ranked = rankSuppliers(draftResults);
    return sortSupplierRows(ranked, sortBy).map((result) => ({
      ...result,
      deliveryDays: result.deliveryDays || 3,
      delivery: result.deliveryDays || result.delivery ? `${result.deliveryDays || 3}d` : '3d',
      isBestPrice: result.rank === 1,
    }));
  }, [draftResults, sortBy]);

  const bestSupplier = useMemo(() => getBestSupplier(draftResults), [draftResults]);
  const highestPriceSupplier = rankedResults.reduce<SupplierProductResult | null>((best, result) => {
    if (!best || (result.totalAmount || 0) > (best.totalAmount || 0)) return result;
    return best;
  }, null);
  const totalPages = Math.max(1, Math.ceil(rankedResults.length / PAGE_SIZE));
  const paginatedResults = rankedResults.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const statusMessage = rankedResults.length === 0 ? 'No suppliers found' : 'Supplier results loaded';

  const csvRows = rankedResults.map((result) => ({
    PROV: result.supplier,
    LOCATION: result.location,
    PRODUCT: result.productName,
    ID: result.productId,
    CATEGORY: result.category,
    DESCRIPTION: result.description,
    QTY: result.quantity,
    PRICE: result.price,
    '%': result.discountPercent,
    DELIVERY: result.delivery,
    TAX: result.taxPercent,
    AMOUNT: result.totalAmount || 0,
  }));

  const handleExportCsv = () => {
    const header = Object.keys(csvRows[0] || {
      PROV: '',
      LOCATION: '',
      PRODUCT: '',
      ID: '',
      CATEGORY: '',
      DESCRIPTION: '',
      QTY: '',
      PRICE: '',
      '%': '',
      DELIVERY: '',
      TAX: '',
      AMOUNT: '',
    });
    const rows = csvRows.map((row) => header.map((column) => JSON.stringify(String(row[column as keyof typeof row] ?? ''))).join(','));
    const csvContent = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `supplier-comparison-${query || 'analysis'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-full space-y-5">
      <div className="w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {query ? <Badge variant="neutral" size="sm">Search: {query}</Badge> : null}
            <Badge variant="neutral" size="sm">Rows: {rankedResults.length}</Badge>
            <Badge variant="success" size="sm">Best: {bestSupplier?.supplier || 'N/A'}</Badge>
            <Badge variant={rankedResults.length === 0 ? 'warning' : 'info'} size="sm">{statusMessage}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SupplierTableSort)} className="max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="aiScore">Sort by AI score</option>
              <option value="totalAmount">Sort by lowest amount</option>
              <option value="unitPrice">Sort by unit price</option>
              <option value="deliveryTime">Sort by delivery time</option>
              <option value="supplier">Sort by supplier</option>
            </select>
            <button onClick={handleExportCsv} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700">
              Export comparison
            </button>
          </div>
        </div>

        <div className="mt-4 w-full overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-[900px] divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">RANK</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">AI SCORE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">PROV</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">LOCATION</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">PRODUCT</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">CATEGORY</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">DESCRIPTION</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">QTY</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">PRICE</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">MARKUP %</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">SELLING PRICE</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">PROFIT / UNIT</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">TOTAL PROFIT</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">DELIVERY</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">TAX</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">AMOUNT</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {paginatedResults.map((result) => {
                const rowKey = buildRowKey(result);
                const isExpanded = expandedProductId === rowKey;

                return (
                  <Fragment key={rowKey}>
                    <tr key={rowKey} onClick={() => setExpandedProductId((current) => current === rowKey ? null : rowKey)} className={`cursor-pointer transition-colors hover:bg-slate-50 ${result.isBestPrice ? 'bg-emerald-50/60' : ''}`}>
                      <td className="px-4 py-4 text-sm font-semibold text-slate-900">{result.rankLabel || `#${result.rank || '-'}`}</td>
                      <td className="px-4 py-4 text-right text-sm font-semibold text-slate-900">{Math.round(result.aiScore || 0)}</td>
                      <td className="px-4 py-4 text-sm text-slate-900">
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" onClick={(event) => {
                            event.stopPropagation();
                            onSupplierClick?.(result);
                          }} className={`font-semibold ${onSupplierClick ? 'text-blue-700 hover:text-blue-900 hover:underline' : 'text-slate-900'} transition-colors`}>
                            {result.supplier}
                          </button>
                          {result.isBestPrice ? <Badge variant="success" size="sm">🏆 Best Price</Badge> : null}
                          {result.isFastestDelivery ? <Badge variant="warning" size="sm">⚡ Fast Delivery</Badge> : null}
                          {result.isTopRated ? <Badge variant="info" size="sm">⭐ Top Rated</Badge> : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">{result.location || 'N/A'}</td>
                      <td className="px-4 py-4 text-sm text-slate-900">
                        <div className="flex items-center gap-3">
                          {result.imageUrl ? <img src={result.imageUrl} alt={String(result.productName || result.description || result.sku || 'Unnamed Product')} className="h-10 w-10 rounded-md object-cover" /> : <div className="h-10 w-10 rounded-md bg-slate-100" />}
                          <span>{String(result.productName || result.description || result.sku || 'Unnamed Product').trim() || 'Unnamed Product'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">{result.productId}</td>
                      <td className="px-4 py-4 text-sm text-slate-700">{result.category}</td>
                      <td className="max-w-[280px] px-4 py-4 text-sm text-slate-600">{result.description}</td>
                      <td className="px-4 py-4 text-right text-sm text-slate-700">{result.quantity}</td>
                      <td className="px-4 py-4 text-right text-sm text-slate-700">{currencyFormatter.format(result.price || 0)}</td>
                      <td className="px-4 py-4 text-right text-sm text-slate-700">{`${result.markupPercent ?? markupPercent}%`}</td>
                      <td className="px-4 py-4 text-right text-sm text-slate-700">{currencyFormatter.format(result.sellingPrice || 0)}</td>
                      <td className="px-4 py-4 text-right text-sm text-emerald-700">{currencyFormatter.format(result.profitPerUnit || 0)}</td>
                      <td className="px-4 py-4 text-right text-sm font-semibold text-emerald-800">{currencyFormatter.format(result.totalProfit || 0)}</td>
                      <td className="px-4 py-4 text-sm text-slate-700">{result.delivery || `${result.deliveryDays || 3}d`}</td>
                      <td className="px-4 py-4 text-right text-sm text-slate-700">{`${result.taxPercent || 0}%`}</td>
                      <td className="px-4 py-4 text-right text-sm font-semibold text-slate-900">{currencyFormatter.format(result.totalAmount || 0)}</td>
                      <td className="px-4 py-4 text-right text-sm">
                        {onDeleteQuote ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteQuote(result);
                            }}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-red-700 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="bg-slate-50/70">
                        <td colSpan={18} className="px-6 py-5">
                          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[160px_1fr]">
                            <div className="w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                              {result.imageUrl ? <img src={result.imageUrl} alt={result.productName} className="h-40 w-40 rounded-xl object-cover" /> : <div className="h-40 w-40 rounded-xl bg-slate-100" />}
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                              <div className="w-full rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Supplier</p><p className="mt-1 text-sm font-semibold text-slate-900">{result.supplier}</p></div>
                              <div className="w-full rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Category</p><p className="mt-1 text-sm font-semibold text-slate-900">{result.category}</p></div>
                              <div className="w-full rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Stock</p><p className="mt-1 text-sm font-semibold text-slate-900">{result.stock}</p></div>
                              <div className="w-full rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2 xl:col-span-3"><p className="text-xs uppercase tracking-wide text-slate-500">Description</p><p className="mt-1 text-sm text-slate-700">{result.description}</p></div>
                              <div className="w-full rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Supplier Price</p><p className="mt-1 text-sm font-semibold text-slate-900">{currencyFormatter.format(result.price || 0)}</p></div>
                              <div className="w-full rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Markup %</p><p className="mt-1 text-sm font-semibold text-slate-900">{result.markupPercent ?? markupPercent}%</p></div>
                              <div className="w-full rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Selling Price</p><p className="mt-1 text-sm font-semibold text-slate-900">{currencyFormatter.format(result.sellingPrice || 0)}</p></div>
                              <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs uppercase tracking-wide text-emerald-700">Profit per unit</p><p className="mt-1 text-sm font-semibold text-emerald-900">{currencyFormatter.format(result.profitPerUnit || 0)}</p></div>
                              <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs uppercase tracking-wide text-emerald-700">Total Profit</p><p className="mt-1 text-sm font-semibold text-emerald-900">{currencyFormatter.format(result.totalProfit || 0)}</p></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {paginatedResults.length === 0 ? (
                <tr>
                  <td colSpan={18} className="px-4 py-8 text-center text-sm text-slate-500">No suppliers found</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <span>Page {currentPage} / {totalPages}</span>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50">
                Previous
              </button>
              <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50">
                Next
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 lg:hidden">
          {paginatedResults.map((result) => (
            <div key={`${buildRowKey(result)}-mobile`} className={`rounded-xl border border-slate-200 p-4 shadow-sm ${result.isBestPrice ? 'bg-emerald-50/60' : 'bg-white'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <button type="button" onClick={() => onSupplierClick?.(result)} className={`text-left font-semibold ${onSupplierClick ? 'text-blue-700 hover:text-blue-900 hover:underline' : 'text-slate-900'} transition-colors`}>
                    {result.supplier}
                  </button>
                  <p className="mt-1 text-xs text-slate-500">{result.rankLabel || `#${result.rank || '-'}`} · AI Score {Math.round(result.aiScore || 0)} · {result.location || 'N/A'}</p>
                </div>
                <div className="text-right">
                  {result.isBestPrice ? <div className="text-[11px] font-medium text-emerald-700">🏆 Best Price</div> : null}
                  {result.isFastestDelivery ? <div className="text-[11px] font-medium text-amber-700">⚡ Fastest Delivery</div> : null}
                  {result.isTopRated ? <div className="text-[11px] font-medium text-violet-700">⭐ Top Rated Supplier</div> : null}
                  <div className="mt-1 text-sm font-semibold text-emerald-800">{currencyFormatter.format(result.totalProfit || 0)}</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-xs text-slate-500">PRODUCT</span><div className="mt-1 flex items-center gap-3 text-slate-900">{result.imageUrl ? <img src={result.imageUrl} alt={String(result.productName || result.description || result.sku || 'Unnamed Product')} className="h-10 w-10 rounded-md object-cover" /> : <div className="h-10 w-10 rounded-md bg-slate-100" />}{String(result.productName || result.description || result.sku || 'Unnamed Product').trim() || 'Unnamed Product'}</div></div>
                <div><span className="text-xs text-slate-500">ID</span><div className="text-slate-900">{result.productId}</div></div>
                <div><span className="text-xs text-slate-500">CATEGORY</span><div className="text-slate-900">{result.category}</div></div>
                <div><span className="text-xs text-slate-500">DELIVERY</span><div className="text-slate-900">{result.delivery || `${result.deliveryDays || 3}d`}</div></div>
                <div><span className="text-xs text-slate-500">QTY</span><div className="text-slate-900">{result.quantity}</div></div>
                <div><span className="text-xs text-slate-500">PRICE</span><div className="text-slate-900">{currencyFormatter.format(result.price || 0)}</div></div>
                <div><span className="text-xs text-slate-500">MARKUP %</span><div className="text-slate-900">{`${result.markupPercent ?? markupPercent}%`}</div></div>
                <div><span className="text-xs text-slate-500">SELLING PRICE</span><div className="text-slate-900">{currencyFormatter.format(result.sellingPrice || 0)}</div></div>
                <div><span className="text-xs text-slate-500">PROFIT / UNIT</span><div className="text-emerald-700">{currencyFormatter.format(result.profitPerUnit || 0)}</div></div>
                <div><span className="text-xs text-slate-500">TOTAL PROFIT</span><div className="text-emerald-800">{currencyFormatter.format(result.totalProfit || 0)}</div></div>
              </div>
              <div className="mt-3 text-sm text-slate-600">{result.description}</div>
              {onDeleteQuote ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => onDeleteQuote(result)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {paginatedResults.length === 0 ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No suppliers found</div> : null}
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Savings vs highest supplier: {currencyFormatter.format(Math.max((highestPriceSupplier?.totalAmount || 0) - (bestSupplier?.totalAmount || 0), 0))}
        </div>
      </div>
    </div>
  );
}
