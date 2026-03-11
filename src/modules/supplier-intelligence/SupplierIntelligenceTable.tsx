import { useMemo, useState } from "react";
import Badge from "../../components/ui/Badge";
import { SUPPLIER_MODE } from "../../config/supplierMode";
import { useNavigate } from "react-router-dom";
import type { SupplierProductResult } from "../supplier-adapters/SupplierAdapter";
import SupplierTable from "../supplier-search/components/SupplierTable";
import { rankSuppliers } from "../supplier-search/utils/rankSuppliers";
import SupplierRecommendationPanel from "./components/SupplierRecommendationPanel";
import SupplierInsightsPanel from "./components/SupplierInsightsPanel";
import SavingsOpportunityPanel from "./components/SavingsOpportunityPanel";
import SupplierMobileCard from "./components/SupplierMobileCard";
import { withRealisticSupplierNames } from "./utils/supplierDisplay";

type SupplierIntelligenceTableProps = {
  loading: boolean;
  query: string;
  results: SupplierProductResult[];
  error: string;
  onDeleteQuote?: (quote: SupplierProductResult) => void;
  onUseQuote: (quote: SupplierProductResult) => void;
  onAddToInvoice: (quote: SupplierProductResult) => void;
  onCreatePurchaseOrder: (quote: SupplierProductResult) => void;
};

export default function SupplierIntelligenceTable({
  loading,
  query,
  results,
  error,
  onDeleteQuote,
  onUseQuote,
  onAddToInvoice,
  onCreatePurchaseOrder,
}: SupplierIntelligenceTableProps) {
  const navigate = useNavigate();
  const [markupPercent, setMarkupPercent] = useState(25);
  const rawResults = results;

  const normalizedResults = useMemo(() => {
    return withRealisticSupplierNames(rawResults).map((item) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const discountPercent = Number(item.discountPercent) || 0;
      const taxPercent = Number(item.taxPercent) || 0;
      const subtotal = quantity * price;
      const discountAmount = subtotal * (discountPercent / 100);
      const taxAmount = (subtotal - discountAmount) * (taxPercent / 100);
      const totalAmount = subtotal - discountAmount + taxAmount;
      const deliveryDays = item.deliveryDays || 3;
      const sellingPrice = Number((price * (1 + markupPercent / 100)).toFixed(2));
      const profitPerUnit = Number((sellingPrice - price).toFixed(2));
      const totalProfit = Number((profitPerUnit * quantity).toFixed(2));

      return {
        ...item,
        quantity,
        price,
        discountPercent,
        taxPercent,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        amount: totalAmount,
        deliveryDays,
        delivery: item.delivery ? item.delivery : `${deliveryDays}d`,
        reliabilityPercent: Number(item.reliabilityPercent) || 88,
        totalOrders: Number(item.totalOrders) || 12,
        totalSpend: Number(item.totalSpend) || totalAmount * Math.max(quantity, 1) * 3,
        averageDeliveryDays: Number(item.averageDeliveryDays) || deliveryDays,
        orderHistoryFactor: Number(item.orderHistoryFactor) || Math.min((Number(item.totalOrders) || 12) * 4, 100),
        markupPercent,
        sellingPrice,
        profitPerUnit,
        totalProfit,
      };
    });
  }, [markupPercent, rawResults]);

  const rankedResults = useMemo(() => rankSuppliers(normalizedResults), [normalizedResults]);

  const supplierInsights = useMemo(() => {
    const supplierMap = new Map<string, SupplierProductResult>();

    rankedResults.forEach((item) => {
      const current = supplierMap.get(item.supplier);
      if (!current || (item.aiScore || 0) > (current.aiScore || 0)) {
        supplierMap.set(item.supplier, item);
      }
    });

    return Array.from(supplierMap.values()).sort((left, right) => (right.aiScore || 0) - (left.aiScore || 0));
  }, [rankedResults]);

  const recommendedSupplier = useMemo(() => rankedResults[0] || null, [rankedResults]);

  const savingsOpportunity = useMemo(() => {
    if (rankedResults.length === 0) return null;
    const averagePrice = rankedResults.reduce((sum, item) => sum + (item.price || 0), 0) / rankedResults.length;
    const bestSupplier = [...rankedResults].sort((left, right) => (left.price || 0) - (right.price || 0))[0];
    const savingsPerUnit = Math.max(averagePrice - (bestSupplier?.price || 0), 0);

    return {
      averagePrice,
      bestSupplier,
      savingsPerUnit,
    };
  }, [rankedResults]);

  const profitInsights = useMemo(() => {
    const suppliersFound = supplierInsights.length;
    const bestProfitSupplier = rankedResults.reduce<SupplierProductResult | null>((best, item) => {
      if (!best || (item.totalProfit || 0) > (best.totalProfit || 0)) {
        return item;
      }

      return best;
    }, null);
    const highestMarginProduct = rankedResults.reduce<SupplierProductResult | null>((best, item) => {
      if (!best || (item.profitPerUnit || 0) > (best.profitPerUnit || 0)) {
        return item;
      }

      return best;
    }, null);
    const lowestCostSupplier = rankedResults.reduce<SupplierProductResult | null>((best, item) => {
      if (!best || (item.price || 0) < (best.price || 0)) {
        return item;
      }

      return best;
    }, null);
    const potentialProfit = rankedResults.reduce((sum, item) => sum + (item.totalProfit || 0), 0);

    return {
      suppliersFound,
      bestProfitSupplier,
      highestMarginProduct,
      lowestCostSupplier,
      potentialProfit,
    };
  }, [rankedResults, supplierInsights.length]);

  const currencyFormatter = useMemo(() => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }), []);

  return (
    <div className="w-full max-w-full space-y-4 overflow-hidden">
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          Loading supplier procurement comparison...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      ) : (
        <div className="w-full max-w-full space-y-5 overflow-hidden">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Suppliers Found</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{profitInsights.suppliersFound}</p>
            </div>
            <div className="w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Best Profit Supplier</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{profitInsights.bestProfitSupplier?.supplier || 'N/A'}</p>
            </div>
            <div className="w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Highest Margin Product</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{profitInsights.highestMarginProduct?.productName || 'N/A'}</p>
            </div>
            <div className="w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Lowest Cost Supplier</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{profitInsights.lowestCostSupplier?.supplier || 'N/A'}</p>
            </div>
            <div className="w-full max-w-full overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Potential Profit</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-900">{currencyFormatter.format(profitInsights.potentialProfit || 0)}</p>
            </div>
          </div>

          <div className="w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Supplier Profit Intelligence</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">Supplier Profit Intelligence Dashboard</h2>
                <p className="mt-2 text-sm text-slate-500">Compare supplier pricing, delivery performance, AI ranking, profit simulation and procurement insights in one place.</p>
              </div>
              <div className="flex w-full max-w-full flex-col gap-3 sm:items-end lg:w-auto">
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <Badge variant="neutral" size="sm">Search: {query || 'Imported suppliers'}</Badge>
                  <Badge variant="neutral" size="sm">Suppliers: {supplierInsights.length}</Badge>
                  <Badge variant="info" size="sm">Mode: {SUPPLIER_MODE}</Badge>
                </div>
                <label className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-700">
                  <span>Markup %</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={markupPercent}
                    onChange={(event) => setMarkupPercent(Math.max(0, Number(event.target.value) || 0))}
                    className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-right text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="hidden lg:block">
            <SupplierTable
              query={query}
              results={rankedResults}
              markupPercent={markupPercent}
              onDeleteQuote={onDeleteQuote}
              onUseQuote={onUseQuote}
              onAddToInvoice={onAddToInvoice}
              onCreatePurchaseOrder={onCreatePurchaseOrder}
              onSupplierClick={(quote: SupplierProductResult) => {
                const supplierId = quote.supplierRecord?.id;
                if (!supplierId) return;

                navigate(`/suppliers/${supplierId}`);
              }}
            />
          </div>

          <div className="lg:hidden space-y-4">
            {rankedResults.map((supplier) => (
              <SupplierMobileCard
                key={`${supplier.supplier}::${supplier.productId}::${supplier.sku}`}
                supplier={supplier}
                onUseQuote={onUseQuote}
                onAddToInvoice={onAddToInvoice}
                onCreatePurchaseOrder={onCreatePurchaseOrder}
                onSupplierClick={(quote: SupplierProductResult) => {
                  const supplierId = quote.supplierRecord?.id;
                  if (!supplierId) return;

                  navigate(`/suppliers/${supplierId}`);
                }}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.6fr_1fr]">
            <SupplierInsightsPanel suppliers={supplierInsights} />

            <div className="w-full max-w-full space-y-5">
              <SupplierRecommendationPanel supplier={recommendedSupplier} />
              {savingsOpportunity ? (
                <SavingsOpportunityPanel
                  averagePrice={savingsOpportunity.averagePrice}
                  bestPrice={savingsOpportunity.bestSupplier?.price || 0}
                  savingsPerUnit={savingsOpportunity.savingsPerUnit}
                  supplierName={savingsOpportunity.bestSupplier?.supplier}
                />
              ) : (
                <SavingsOpportunityPanel averagePrice={0} bestPrice={0} savingsPerUnit={0} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
