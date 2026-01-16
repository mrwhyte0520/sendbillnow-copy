import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { productsService } from '../../../services/contador/products.service';
import type { Product as ProductType } from '../../../services/contador/products.service';

interface Product {
  id: string;
  name: string;
  sku: string;
  cost: number;
  price: number;
  margin: number;
  unitsSold: number;
  revenue: number;
  status: 'active' | 'inactive';
}

export default function ContadorProductsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'all' | 'bestsellers' | 'lowsellers' | 'margins'>('all');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [products, setProducts] = useState<Product[]>([]);
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
      const data = await productsService.list(user.id);
      const mapped: Product[] = data.map((p: ProductType) => {
        const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          cost: p.cost,
          price: p.price,
          margin: Math.round(margin * 100) / 100,
          unitsSold: 0, // Would come from sales data
          revenue: 0, // Would come from sales data
          status: p.status === 'active' ? 'active' : 'inactive',
        };
      });
      setProducts(mapped);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p => 
    filterStatus === 'all' ? true : p.status === filterStatus
  );

  const sortedByRevenue = [...products].sort((a, b) => b.revenue - a.revenue);
  const bestSellers = sortedByRevenue.slice(0, 3);
  const lowSellers = sortedByRevenue.slice(-3).reverse();

  const stats = {
    totalProducts: products.filter(p => p.status === 'active').length,
    totalRevenue: products.reduce((acc, p) => acc + p.revenue, 0),
    avgMargin: products.length > 0 ? Math.round(products.reduce((acc, p) => acc + p.margin, 0) / products.length) : 0,
    totalUnitsSold: products.reduce((acc, p) => acc + p.unitsSold, 0),
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#008000]/10 rounded-lg">
              <i className="ri-price-tag-3-line text-2xl text-[#008000]"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Products</h1>
              <p className="text-gray-600">Product Accounting & Profitability</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddProduct(true)}
            className="px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium hover:from-[#097509] hover:to-[#005300] flex items-center gap-2"
          >
            <i className="ri-add-line"></i>
            Add Product
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <i className="ri-shopping-bag-line text-xl text-blue-600"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Active Products</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalProducts}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <i className="ri-money-dollar-circle-line text-xl text-green-600"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Revenue</p>
                <p className="text-2xl font-bold text-green-600">${stats.totalRevenue.toFixed(2)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <i className="ri-percent-line text-xl text-purple-600"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Avg. Margin</p>
                <p className="text-2xl font-bold text-purple-600">{stats.avgMargin}%</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <i className="ri-stack-line text-xl text-orange-600"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Units Sold</p>
                <p className="text-2xl font-bold text-orange-600">{stats.totalUnitsSold}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex">
              {[
                { id: 'all', label: 'All Products', icon: 'ri-list-check-2' },
                { id: 'bestsellers', label: 'Best Sellers', icon: 'ri-trophy-line' },
                { id: 'lowsellers', label: 'Low Sellers', icon: 'ri-arrow-down-line' },
                { id: 'margins', label: 'Profit Margins', icon: 'ri-percent-line' },
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
            {/* Filter */}
            {activeTab === 'all' && (
              <div className="flex items-center gap-4 mb-4">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
                <div className="flex-1"></div>
                <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                  <i className="ri-download-line"></i>
                  Export
                </button>
              </div>
            )}

            {/* All Products Tab */}
            {activeTab === 'all' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">SKU</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Cost</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Price</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Margin</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Units Sold</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredProducts.map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{product.name}</td>
                        <td className="px-4 py-3 text-gray-600">{product.sku}</td>
                        <td className="px-4 py-3 text-right text-gray-600">${product.cost.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">${product.price.toFixed(2)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${product.margin >= 50 ? 'text-green-600' : 'text-orange-600'}`}>
                          {product.margin.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{product.unitsSold}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            product.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {product.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button className="p-1 hover:bg-gray-100 rounded" title="Edit">
                              <i className="ri-edit-line text-gray-500"></i>
                            </button>
                            <button className="p-1 hover:bg-gray-100 rounded" title="View Details">
                              <i className="ri-eye-line text-gray-500"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Best Sellers Tab */}
            {activeTab === 'bestsellers' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 mb-4">Top 3 products by revenue</p>
                {bestSellers.map((product, idx) => (
                  <div key={product.id} className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                      idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : 'bg-orange-400'
                    }`}>
                      #{idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-500">{product.unitsSold} units sold</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-[#008000]">${product.revenue.toFixed(2)}</p>
                      <p className="text-sm text-gray-500">Revenue</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Low Sellers Tab */}
            {activeTab === 'lowsellers' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 mb-4">Bottom 3 products by revenue - consider pricing or promotion strategies</p>
                {lowSellers.map((product) => (
                  <div key={product.id} className="flex items-center gap-4 p-4 border border-red-200 bg-red-50 rounded-lg">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <i className="ri-arrow-down-line text-xl text-red-600"></i>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-500">{product.unitsSold} units sold</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-600">${product.revenue.toFixed(2)}</p>
                      <p className="text-sm text-gray-500">Revenue</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Margins Tab */}
            {activeTab === 'margins' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Cost</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Selling Price</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Profit/Unit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Margin %</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Analysis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {[...products].sort((a, b) => b.margin - a.margin).map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{product.name}</td>
                        <td className="px-4 py-3 text-right text-gray-600">${product.cost.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-gray-900">${product.price.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-green-600">${(product.price - product.cost).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${product.margin >= 50 ? 'bg-green-500' : product.margin >= 30 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{ width: `${Math.min(product.margin, 100)}%` }}
                              ></div>
                            </div>
                            <span className="font-medium">{product.margin.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            product.margin >= 50 ? 'bg-green-100 text-green-700' : 
                            product.margin >= 30 ? 'bg-yellow-100 text-yellow-700' : 
                            'bg-red-100 text-red-700'
                          }`}>
                            {product.margin >= 50 ? 'Excellent' : product.margin >= 30 ? 'Good' : 'Review Pricing'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Add Product Modal */}
        {showAddProduct && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Add New Product</h2>
                <button onClick={() => setShowAddProduct(false)} className="p-1 hover:bg-gray-100 rounded">
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                  <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                  <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cost ($)</label>
                    <input type="number" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price ($)</label>
                    <input type="number" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowAddProduct(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium">Add Product</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
