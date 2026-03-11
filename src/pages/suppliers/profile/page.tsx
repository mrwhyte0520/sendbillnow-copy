import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { purchaseOrderItemsService, purchaseOrdersService, suppliersService } from '../../../services/database';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

type PurchaseHistoryRow = {
  id: string;
  date: string;
  product: string;
  quantity: number;
  price: number;
};

export default function SupplierProfilePage() {
  const { supplierId } = useParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [supplier, setSupplier] = useState<any | null>(null);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryRow[]>([]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.id || !supplierId) {
        setSupplier(null);
        setPurchaseHistory([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const [supplierRows, purchaseOrders, purchaseOrderItems] = await Promise.all([
          suppliersService.getAll(user.id),
          purchaseOrdersService.getAll(user.id),
          purchaseOrderItemsService.getAllByUser(user.id),
        ]);

        const matchedSupplier = (supplierRows || []).find((row: any) => String(row.id) === String(supplierId)) || null;
        setSupplier(matchedSupplier);

        const orderIds = new Set(
          (purchaseOrders || [])
            .filter((order: any) => String(order.supplier_id || '') === String(supplierId))
            .map((order: any) => String(order.id)),
        );

        const history = (purchaseOrderItems || [])
          .filter((item: any) => orderIds.has(String(item.purchase_order_id || '')))
          .map((item: any) => {
            const order = (purchaseOrders || []).find((row: any) => String(row.id) === String(item.purchase_order_id || ''));
            return {
              id: String(item.id || `${item.purchase_order_id}-${item.inventory_item_id || item.description}`),
              date: String(order?.order_date || order?.created_at || item.created_at || ''),
              product: String(item.description || item.inventory_items?.name || 'Unnamed product'),
              quantity: Number(item.quantity || 0) || 0,
              price: Number(item.unit_cost || 0) || 0,
            };
          })
          .sort((left: any, right: any) => new Date(right.date).getTime() - new Date(left.date).getTime());

        setPurchaseHistory(history);
      } catch (error) {
        console.error('Error loading supplier profile', error);
        setSupplier(null);
        setPurchaseHistory([]);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [supplierId, user?.id]);

  const suppliedProducts = useMemo(() => {
    return Array.from(new Set(purchaseHistory.map((row) => row.product).filter(Boolean)));
  }, [purchaseHistory]);

  return (
    <DashboardLayout>
      <div className="min-h-screen space-y-6 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-blue-600">Supplier Profile</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">{loading ? 'Loading supplier...' : supplier?.name || supplier?.legal_name || 'Supplier not found'}</h1>
            <p className="mt-2 text-sm text-slate-500">Review supplier contact details, supplied products, and purchase history from Supabase.</p>
          </div>
          <Link to="/supplier-intelligence" className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700">
            Back to Supplier Intelligence
          </Link>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Loading supplier profile...</div>
        ) : !supplier ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Supplier not found for the provided ID.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
                <h2 className="text-lg font-semibold text-slate-900">Supplier Information</h2>
                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier name</p>
                    <p className="mt-1 text-sm text-slate-900">{supplier.legal_name || supplier.name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</p>
                    <p className="mt-1 text-sm text-slate-900">{supplier.address || supplier.city || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact information</p>
                    <p className="mt-1 text-sm text-slate-900">{supplier.phone || supplier.contact_phone || 'No phone'}</p>
                    <p className="mt-1 text-sm text-slate-900">{supplier.email || supplier.contact_email || 'No email'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tax ID</p>
                    <p className="mt-1 text-sm text-slate-900">{supplier.tax_id || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Products Supplied</h2>
                <div className="mt-4 space-y-2">
                  {suppliedProducts.length === 0 ? (
                    <p className="text-sm text-slate-500">No supplied products found yet.</p>
                  ) : (
                    suppliedProducts.map((product) => (
                      <div key={product} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {product}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Purchase History</h2>
                  <p className="text-sm text-slate-500">Historical purchase orders loaded from Supabase.</p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
                  Rows: {purchaseHistory.length}
                </div>
              </div>

              {purchaseHistory.length === 0 ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No purchase history found for this supplier.</div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Product</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Quantity</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {purchaseHistory.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-4 text-sm text-slate-700">{row.date ? new Date(row.date).toLocaleDateString() : 'N/A'}</td>
                          <td className="px-4 py-4 text-sm text-slate-900">{row.product}</td>
                          <td className="px-4 py-4 text-right text-sm text-slate-700">{row.quantity}</td>
                          <td className="px-4 py-4 text-right text-sm font-medium text-slate-900">{currencyFormatter.format(row.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
