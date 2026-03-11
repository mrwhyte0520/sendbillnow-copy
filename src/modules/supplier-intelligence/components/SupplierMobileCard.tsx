import type { SupplierProductResult } from '../../supplier-adapters/SupplierAdapter';

type SupplierMobileCardProps = {
  supplier: SupplierProductResult;
  onSupplierClick?: (quote: SupplierProductResult) => void;
  onUseQuote: (quote: SupplierProductResult) => void;
  onAddToInvoice: (quote: SupplierProductResult) => void;
  onCreatePurchaseOrder: (quote: SupplierProductResult) => void;
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

const getStockStatus = (stock: number) => {
  const normalizedStock = Number(stock) || 0;

  if (normalizedStock <= 0) {
    return {
      label: 'Out of Stock',
      className: 'bg-red-100 text-red-700 px-2 py-0.5 text-xs rounded-md font-medium',
    };
  }

  if (normalizedStock <= 5) {
    return {
      label: 'Low Stock',
      className: 'bg-amber-100 text-amber-700 px-2 py-0.5 text-xs rounded-md font-medium',
    };
  }

  return {
    label: 'In Stock',
    className: 'bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs rounded-md font-medium',
  };
};

export default function SupplierMobileCard({
  supplier,
  onSupplierClick,
  onUseQuote,
  onAddToInvoice,
  onCreatePurchaseOrder,
}: SupplierMobileCardProps) {
  const stockStatus = getStockStatus(supplier.stock || 0);

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 ${supplier.isBestPrice ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">Product Name</p>
          <p className="mt-1 text-base font-semibold text-slate-900">{supplier.productName}</p>
          <button
            type="button"
            onClick={() => onSupplierClick?.(supplier)}
            className={`mt-2 text-left text-sm font-medium ${onSupplierClick ? 'text-blue-700 hover:text-blue-900 hover:underline' : 'text-slate-700'} transition-colors`}
          >
            {supplier.supplier}
          </button>
        </div>
        <div className="flex flex-col items-end gap-1">
          {supplier.isBestPrice ? <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs rounded-md font-medium">🏆 Best Price</span> : null}
          {supplier.isFastestDelivery ? <span className="bg-amber-100 text-amber-700 px-2 py-0.5 text-xs rounded-md font-medium">⚡ Fast Delivery</span> : null}
          {supplier.isTopRated ? <span className="bg-violet-100 text-violet-700 px-2 py-0.5 text-xs rounded-md font-medium">⭐ Top Rated</span> : null}
          <span className={stockStatus.className}>{stockStatus.label}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Supplier</p>
          <p className="mt-1 font-medium text-slate-900">{supplier.supplier}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Supplier Price</p>
          <p className="mt-1 font-medium text-slate-900">{currencyFormatter.format(supplier.price || 0)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Profit per unit</p>
          <p className="mt-1 font-medium text-emerald-700">{currencyFormatter.format(supplier.profitPerUnit || 0)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Delivery time</p>
          <p className="mt-1 font-medium text-slate-900">{supplier.delivery || `${supplier.deliveryDays || 3}d`}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Stock status</p>
          <div className="mt-1">
            <span className={stockStatus.className}>{stockStatus.label}</span>
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">SKU</p>
          <p className="mt-1 truncate font-medium text-slate-900">{supplier.sku || 'N/A'}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onUseQuote(supplier)}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
        >
          Use Quote
        </button>
        <button
          type="button"
          onClick={() => onAddToInvoice(supplier)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Add to Invoice
        </button>
        <button
          type="button"
          onClick={() => onCreatePurchaseOrder(supplier)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Create Purchase Order
        </button>
      </div>
    </div>
  );
}
