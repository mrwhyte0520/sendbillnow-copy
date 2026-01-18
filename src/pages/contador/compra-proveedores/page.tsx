import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { resolveTenantId } from '../../../services/database';
import { vendorsService, purchaseOrdersService, vendorBillsService } from '../../../services/contador/vendors.service';
import type { Vendor as VendorType, PurchaseOrder as POType, VendorBill } from '../../../services/contador/vendors.service';

interface Vendor {
  id: string;
  name: string;
  contact: string;
  email: string;
  balance: number;
  status: 'active' | 'inactive';
}

interface PurchaseOrder {
  id: string;
  vendorName: string;
  date: string;
  total: number;
  status: 'pending' | 'approved' | 'received' | 'cancelled';
  dueDate: string;
}

export default function ContadorCompraProveedoresPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'vendors' | 'orders'>('vendors');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [vendorBills, setVendorBills] = useState<VendorBill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;
      const [vends, pos, bills] = await Promise.all([
        vendorsService.list(tenantId),
        purchaseOrdersService.list(tenantId),
        vendorBillsService.list(tenantId, { status: 'open' }).catch(() => []),
      ]);

      const mappedVendors: Vendor[] = await Promise.all(
        vends.map(async (v: VendorType) => {
          let balance = 0;
          try {
            balance = await vendorsService.getBalance(v.id);
          } catch {
            balance = 0;
          }
          return {
            id: v.id,
            name: v.name,
            contact: v.phone || '',
            email: v.email || '',
            balance,
            status: v.status === 'active' ? 'active' : 'inactive',
          };
        })
      );

      const mappedPOs: PurchaseOrder[] = pos.map((po: POType) => ({
        id: po.po_number,
        vendorName: po.vendor?.name || 'Unknown',
        date: po.order_date,
        total: po.total,
        status:
          po.status === 'received'
            ? 'received'
            : po.status === 'approved'
              ? 'approved'
              : po.status === 'cancelled'
                ? 'cancelled'
                : 'pending',
        dueDate: (po.expected_date || po.order_date) as string,
      }));

      setVendors(mappedVendors);
      setPurchaseOrders(mappedPOs);
      setVendorBills((bills || []) as VendorBill[]);
    } catch (error) {
      console.error('Error loading vendor data:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalPayable = vendors.reduce((acc, v) => acc + v.balance, 0);
  const pendingOrders = purchaseOrders.filter(o => o.status === 'pending').length;

  const aging = (() => {
    const today = new Date();
    const toDaysPastDue = (dueDate: string | null): number => {
      if (!dueDate) return 0;
      const due = new Date(dueDate);
      if (Number.isNaN(due.getTime())) return 0;
      const diffMs = today.getTime() - due.getTime();
      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    };

    const buckets = {
      current: 0,
      d1_30: 0,
      d31_60: 0,
      d60p: 0,
    };

    (vendorBills || []).forEach((b) => {
      const amt = Number((b as any).balance_due ?? b.total ?? 0) || 0;
      const daysPastDue = toDaysPastDue(b.due_date);
      if (daysPastDue <= 0) buckets.current += amt;
      else if (daysPastDue <= 30) buckets.d1_30 += amt;
      else if (daysPastDue <= 60) buckets.d31_60 += amt;
      else buckets.d60p += amt;
    });

    return {
      current: Math.round(buckets.current * 100) / 100,
      d1_30: Math.round(buckets.d1_30 * 100) / 100,
      d31_60: Math.round(buckets.d31_60 * 100) / 100,
      d60p: Math.round(buckets.d60p * 100) / 100,
    };
  })();

  const stats = {
    totalVendors: vendors.filter(v => v.status === 'active').length,
    totalPayable,
    pendingOrders,
    overdueAmount: Math.round((aging.d1_30 + aging.d31_60 + aging.d60p) * 100) / 100,
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#008000]/10 rounded-lg">
              <i className="ri-shopping-bag-line text-2xl text-[#008000]"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Purchases & Vendors</h1>
              <p className="text-gray-600">Accounts Payable Management</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <i className="ri-store-2-line text-xl text-blue-600"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Active Vendors</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalVendors}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <i className="ri-money-dollar-circle-line text-xl text-orange-600"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Payable</p>
                <p className="text-2xl font-bold text-orange-600">${stats.totalPayable.toFixed(2)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <i className="ri-time-line text-xl text-yellow-600"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Pending Orders</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pendingOrders}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <i className="ri-error-warning-line text-xl text-red-600"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Overdue</p>
                <p className="text-2xl font-bold text-red-600">${stats.overdueAmount.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex">
              {[
                { id: 'vendors', label: 'Vendors', icon: 'ri-store-2-line' },
                { id: 'orders', label: 'Purchase Orders', icon: 'ri-file-list-3-line' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-[#008000] text-[#008000] bg-[#008000]/5'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <i className={tab.icon}></i>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4">
            {loading && (
              <div className="py-10 text-center text-gray-500">
                <i className="ri-loader-4-line animate-spin text-3xl mb-2 block"></i>
                Loading...
              </div>
            )}

            {/* Vendors Tab */}
            {!loading && activeTab === 'vendors' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Vendor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Contact</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Balance</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {vendors.map((vendor) => (
                      <tr key={vendor.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{vendor.name}</td>
                        <td className="px-4 py-3 text-gray-600">{vendor.contact}</td>
                        <td className="px-4 py-3 text-gray-600">{vendor.email}</td>
                        <td className={`px-4 py-3 text-right font-medium ${vendor.balance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          ${vendor.balance.toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            vendor.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {vendor.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Purchase Orders Tab */}
            {!loading && activeTab === 'orders' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">PO #</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Vendor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Due Date</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {purchaseOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-[#008000]">{order.id}</td>
                        <td className="px-4 py-3 text-gray-900">{order.vendorName}</td>
                        <td className="px-4 py-3 text-gray-600">{order.date}</td>
                        <td className="px-4 py-3 text-gray-600">{order.dueDate}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">${order.total.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            order.status === 'received' ? 'bg-blue-100 text-blue-700' :
                            order.status === 'approved' ? 'bg-green-100 text-green-700' :
                            order.status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* AP Aging Tab removed per user request */}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
