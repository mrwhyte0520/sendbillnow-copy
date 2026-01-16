import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { vendorsService, purchaseOrdersService } from '../../../services/contador/vendors.service';
import type { Vendor as VendorType, PurchaseOrder as POType } from '../../../services/contador/vendors.service';

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
  status: 'pending' | 'received' | 'paid';
  dueDate: string;
}

export default function ContadorCompraProveedoresPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'vendors' | 'orders' | 'aging'>('vendors');
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showAddOrder, setShowAddOrder] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
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
      const [vends, pos] = await Promise.all([
        vendorsService.list(user.id),
        purchaseOrdersService.list(user.id),
      ]);

      const mappedVendors: Vendor[] = vends.map((v: VendorType) => ({
        id: v.id,
        name: v.name,
        contact: v.phone || '',
        email: v.email || '',
        balance: 0, // Would come from bills
        status: v.status === 'active' ? 'active' : 'inactive',
      }));

      const mappedPOs: PurchaseOrder[] = pos.map((po: POType) => ({
        id: po.po_number,
        vendorName: po.vendor?.name || 'Unknown',
        date: po.order_date,
        total: po.total,
        status: po.status === 'received' ? 'received' : po.status === 'sent' ? 'pending' : 'pending',
        dueDate: po.order_date,
      }));

      setVendors(mappedVendors);
      setPurchaseOrders(mappedPOs);
    } catch (error) {
      console.error('Error loading vendor data:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalPayable = vendors.reduce((acc, v) => acc + v.balance, 0);
  const pendingOrders = purchaseOrders.filter(o => o.status === 'pending').length;

  const stats = {
    totalVendors: vendors.filter(v => v.status === 'active').length,
    totalPayable,
    pendingOrders,
    overdueAmount: 0,
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
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddVendor(true)}
              className="px-4 py-2 border border-[#008000] text-[#008000] rounded-lg font-medium hover:bg-[#008000]/5 flex items-center gap-2"
            >
              <i className="ri-user-add-line"></i>
              Add Vendor
            </button>
            <button
              onClick={() => setShowAddOrder(true)}
              className="px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium hover:from-[#097509] hover:to-[#005300] flex items-center gap-2"
            >
              <i className="ri-add-line"></i>
              New Purchase Order
            </button>
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
                { id: 'aging', label: 'AP Aging', icon: 'ri-time-line' },
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
            {/* Vendors Tab */}
            {activeTab === 'vendors' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Vendor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Contact</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Balance</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
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
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button className="p-1 hover:bg-gray-100 rounded" title="View History">
                              <i className="ri-history-line text-gray-500"></i>
                            </button>
                            <button className="p-1 hover:bg-gray-100 rounded" title="Make Payment">
                              <i className="ri-money-dollar-circle-line text-[#008000]"></i>
                            </button>
                            <button className="p-1 hover:bg-gray-100 rounded" title="Edit">
                              <i className="ri-edit-line text-gray-500"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Purchase Orders Tab */}
            {activeTab === 'orders' && (
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
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
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
                            order.status === 'paid' ? 'bg-green-100 text-green-700' :
                            order.status === 'received' ? 'bg-blue-100 text-blue-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button className="p-1 hover:bg-gray-100 rounded" title="View">
                              <i className="ri-eye-line text-gray-500"></i>
                            </button>
                            {order.status !== 'paid' && (
                              <button className="p-1 hover:bg-gray-100 rounded" title="Pay">
                                <i className="ri-money-dollar-circle-line text-[#008000]"></i>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* AP Aging Tab */}
            {activeTab === 'aging' && (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <p className="text-sm text-green-700 mb-1">Current</p>
                    <p className="text-2xl font-bold text-green-600">$1,200.00</p>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                    <p className="text-sm text-yellow-700 mb-1">1-30 Days</p>
                    <p className="text-2xl font-bold text-yellow-600">$2,500.00</p>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
                    <p className="text-sm text-orange-700 mb-1">31-60 Days</p>
                    <p className="text-2xl font-bold text-orange-600">$0.00</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                    <p className="text-sm text-red-700 mb-1">60+ Days</p>
                    <p className="text-2xl font-bold text-red-600">$4,500.00</p>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Vendor</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Current</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">1-30 Days</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">31-60 Days</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">60+ Days</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">ABC Supplies Inc.</td>
                        <td className="px-4 py-3 text-right">$0.00</td>
                        <td className="px-4 py-3 text-right">$2,500.00</td>
                        <td className="px-4 py-3 text-right">$0.00</td>
                        <td className="px-4 py-3 text-right">$0.00</td>
                        <td className="px-4 py-3 text-right font-bold">$2,500.00</td>
                      </tr>
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">Tech Solutions LLC</td>
                        <td className="px-4 py-3 text-right">$1,200.00</td>
                        <td className="px-4 py-3 text-right">$0.00</td>
                        <td className="px-4 py-3 text-right">$0.00</td>
                        <td className="px-4 py-3 text-right">$0.00</td>
                        <td className="px-4 py-3 text-right font-bold">$1,200.00</td>
                      </tr>
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">Global Wholesale</td>
                        <td className="px-4 py-3 text-right">$0.00</td>
                        <td className="px-4 py-3 text-right">$0.00</td>
                        <td className="px-4 py-3 text-right">$0.00</td>
                        <td className="px-4 py-3 text-right text-red-600">$4,500.00</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">$4,500.00</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Add Vendor Modal */}
        {showAddVendor && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Add New Vendor</h2>
                <button onClick={() => setShowAddVendor(false)} className="p-1 hover:bg-gray-100 rounded">
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                  <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                  <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="tel" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowAddVendor(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium">Add Vendor</button>
              </div>
            </div>
          </div>
        )}

        {/* Add Purchase Order Modal */}
        {showAddOrder && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">New Purchase Order</h2>
                <button onClick={() => setShowAddOrder(false)} className="p-1 hover:bg-gray-100 rounded">
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]">
                    <option>Select vendor...</option>
                    {vendors.filter(v => v.status === 'active').map(v => (
                      <option key={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Order Date</label>
                  <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount ($)</label>
                  <input type="number" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowAddOrder(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium">Create Order</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
