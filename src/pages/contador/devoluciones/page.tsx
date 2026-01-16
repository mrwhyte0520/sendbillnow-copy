import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { salesReturnsService, vendorReturnsService } from '../../../services/contador/returns.service';
import type { SalesReturn, VendorReturn } from '../../../services/contador/returns.service';

interface Return {
  id: string;
  date: string;
  type: 'customer' | 'vendor';
  reference: string;
  customerVendor: string;
  product: string;
  quantity: number;
  amount: number;
  reason: string;
  status: 'pending' | 'processed' | 'refunded';
}

export default function ContadorDevolucionesPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'all' | 'customer' | 'vendor' | 'analysis'>('all');
  const [showNewReturn, setShowNewReturn] = useState(false);
  const [returns, setReturns] = useState<Return[]>([]);
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
      const [salesRets, vendorRets] = await Promise.all([
        salesReturnsService.list(user.id),
        vendorReturnsService.list(user.id),
      ]);

      const mappedSales: Return[] = salesRets.map((r: SalesReturn) => ({
        id: r.return_number,
        date: r.return_date,
        type: 'customer' as const,
        reference: r.sale_id || '',
        customerVendor: r.customer_id || 'Walk-in',
        product: 'Multiple',
        quantity: 1,
        amount: r.total_refund,
        reason: r.reason || '',
        status: 'refunded' as const,
      }));

      const mappedVendor: Return[] = vendorRets.map((r: VendorReturn) => ({
        id: r.vendor_return_number,
        date: r.return_date,
        type: 'vendor' as const,
        reference: r.id,
        customerVendor: (r as any).vendor?.name || 'Unknown',
        product: 'Multiple',
        quantity: 1,
        amount: 0,
        reason: r.memo || '',
        status: r.status === 'credited' ? 'refunded' : r.status === 'received' ? 'processed' : 'pending',
      }));

      setReturns([...mappedSales, ...mappedVendor]);
    } catch (error) {
      console.error('Error loading returns:', error);
    } finally {
      setLoading(false);
    }
  };

  const customerReturns = returns.filter(r => r.type === 'customer');
  const vendorReturns = returns.filter(r => r.type === 'vendor');

  // Calculate reason statistics from actual returns
  const reasonStats = returns.reduce((acc: { reason: string; count: number; amount: number }[], r) => {
    const existing = acc.find(item => item.reason === (r.reason || 'Other'));
    if (existing) {
      existing.count++;
      existing.amount += r.amount;
    } else {
      acc.push({ reason: r.reason || 'Other', count: 1, amount: r.amount });
    }
    return acc;
  }, []);

  const stats = {
    totalReturns: returns.length,
    totalRefunded: returns.filter(r => r.status === 'refunded').reduce((acc, r) => acc + r.amount, 0),
    pendingReturns: returns.filter(r => r.status === 'pending').length,
    revenueImpact: customerReturns.reduce((acc, r) => acc + r.amount, 0),
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#008000]/10 rounded-lg">
              <i className="ri-arrow-go-back-line text-2xl text-[#008000]"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Returns</h1>
              <p className="text-gray-600">Sales & Purchase Returns Management</p>
            </div>
          </div>
          <button
            onClick={() => setShowNewReturn(true)}
            className="px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium hover:from-[#097509] hover:to-[#005300] flex items-center gap-2"
          >
            <i className="ri-add-line"></i>
            New Return
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-arrow-go-back-line text-xl text-[#008000]"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Returns</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalReturns}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-refund-2-line text-xl text-[#008000]"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Refunded</p>
                <p className="text-2xl font-bold text-[#008000]">${stats.totalRefunded.toFixed(2)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-time-line text-xl text-[#008000]"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Pending</p>
                <p className="text-2xl font-bold text-[#008000]">{stats.pendingReturns}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-line-chart-line text-xl text-[#008000]"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Revenue Impact</p>
                <p className="text-2xl font-bold text-[#008000]">-${stats.revenueImpact.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#008000]"></div>
            <span className="ml-3 text-gray-600">Loading returns...</span>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex">
              {[
                { id: 'all', label: 'All Returns', icon: 'ri-list-check-2' },
                { id: 'customer', label: 'Customer Returns', icon: 'ri-user-received-line' },
                { id: 'vendor', label: 'Vendor Returns', icon: 'ri-truck-line' },
                { id: 'analysis', label: 'Analysis', icon: 'ri-pie-chart-line' },
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
            {/* All Returns Tab */}
            {(activeTab === 'all' || activeTab === 'customer' || activeTab === 'vendor') && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Return #</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Customer/Vendor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Reason</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(activeTab === 'all' ? returns : activeTab === 'customer' ? customerReturns : vendorReturns).map((ret) => (
                      <tr key={ret.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-[#008000]">{ret.id}</td>
                        <td className="px-4 py-3 text-gray-600">{ret.date}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            ret.type === 'customer' ? 'bg-[#008000]/10 text-[#006600]' : 'bg-[#008000]/10 text-[#006600]'
                          }`}>
                            {ret.type === 'customer' ? 'Customer' : 'Vendor'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-900">{ret.customerVendor}</td>
                        <td className="px-4 py-3 text-gray-600">{ret.product}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{ret.quantity}</td>
                        <td className="px-4 py-3 text-right font-medium text-red-600">${ret.amount.toFixed(2)}</td>
                        <td className="px-4 py-3 text-gray-600">{ret.reason}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            ret.status === 'refunded' ? 'bg-[#008000]/15 text-[#006600]' :
                            ret.status === 'processed' ? 'bg-[#008000]/10 text-[#006600]' :
                            'bg-[#008000]/5 text-[#006600]'
                          }`}>
                            {ret.status.charAt(0).toUpperCase() + ret.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button className="p-1 hover:bg-gray-100 rounded" title="View">
                              <i className="ri-eye-line text-gray-500"></i>
                            </button>
                            {ret.status === 'pending' && (
                              <button className="p-1 hover:bg-gray-100 rounded" title="Process">
                                <i className="ri-check-line text-[#008000]"></i>
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

            {/* Analysis Tab */}
            {activeTab === 'analysis' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Return Reasons */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-4">Return Reasons</h3>
                    <div className="space-y-3">
                      {reasonStats.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-gray-600">{item.reason}</span>
                              <span className="font-medium">{item.count} returns</span>
                            </div>
                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-[#008000]"
                                style={{ width: `${(item.count / reasonStats.reduce((a, r) => a + r.count, 0)) * 100}%` }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Revenue Impact */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-4">Revenue Impact Summary</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between py-2 border-b border-gray-200">
                        <span className="text-gray-600">Customer Returns</span>
                        <span className="font-medium text-red-600">-${customerReturns.reduce((a, r) => a + r.amount, 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-200">
                        <span className="text-gray-600">Vendor Returns (Credit)</span>
                        <span className="font-medium text-green-600">+${vendorReturns.reduce((a, r) => a + r.amount, 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-2 text-lg">
                        <span className="font-semibold">Net Impact</span>
                        <span className="font-bold text-red-600">
                          -${(customerReturns.reduce((a, r) => a + r.amount, 0) - vendorReturns.reduce((a, r) => a + r.amount, 0)).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2">
                    <i className="ri-file-pdf-line"></i>
                    Export PDF
                  </button>
                  <button className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2">
                    <i className="ri-file-excel-line"></i>
                    Export Excel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* New Return Modal */}
        {showNewReturn && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">New Return</h2>
                <button onClick={() => setShowNewReturn(false)} className="p-1 hover:bg-gray-100 rounded">
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Return Type</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]">
                    <option>Customer Return</option>
                    <option>Vendor Return</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Original Invoice/PO</label>
                  <input type="text" placeholder="INV-XXXX or PO-XXXX" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
                  <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                    <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                    <input type="number" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]">
                    <option>Defective</option>
                    <option>Wrong item</option>
                    <option>Not as described</option>
                    <option>Damaged in shipping</option>
                    <option>Changed mind</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowNewReturn(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium">Create Return</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
