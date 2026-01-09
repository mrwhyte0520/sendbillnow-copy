import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { assetDisposalService, fixedAssetsService, settingsService } from '../../../services/database';
import { exportToExcelWithHeaders } from '../../../utils/exportImportUtils';
import { formatMoney } from '../../../utils/numberFormat';

interface AssetDisposal {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  category: string;
  originalCost: number;
  accumulatedDepreciation: number;
  bookValue: number;
  disposalDate: string;
  disposalMethod: string;
  disposalReason: string;
  salePrice: number;
  gainLoss: number;
  authorizedBy: string;
  status: string;
  notes: string;
  buyer: string;
}

interface AssetOption {
  id: string;
  code: string;
  name: string;
  category: string;
  bookValue: number;
}

export default function AssetDisposalPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editingDisposal, setEditingDisposal] = useState<AssetDisposal | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMethod, setFilterMethod] = useState('');

  const [disposals, setDisposals] = useState<AssetDisposal[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [bookValueInput, setBookValueInput] = useState<string>('');

  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      try {
        const [disposalsData, assetsData] = await Promise.all([
          assetDisposalService.getAll(user.id),
          fixedAssetsService.getAll(user.id),
        ]);

        const mappedDisposals: AssetDisposal[] = (disposalsData || []).map((d: any) => ({
          id: d.id,
          assetId: d.asset_id,
          assetCode: d.asset_code,
          assetName: d.asset_name,
          category: d.category,
          originalCost: Number(d.original_cost) || 0,
          accumulatedDepreciation: Number(d.accumulated_depreciation) || 0,
          bookValue: Number(d.book_value) || 0,
          disposalDate: d.disposal_date,
          disposalMethod: d.disposal_method,
          disposalReason: d.disposal_reason,
          salePrice: Number(d.sale_price) || 0,
          gainLoss: Number(d.gain_loss) || 0,
          authorizedBy: d.authorized_by || '',
          status: d.status,
          notes: d.notes || '',
          buyer: d.buyer || '',
        }));
        setDisposals(mappedDisposals);

        const mappedAssets: AssetOption[] = (assetsData || []).map((a: any) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          category: a.category || '',
          // usaremos current_value como valor en libros base
          bookValue: Number(a.current_value) || 0,
        }));
        setAssets(mappedAssets);
      } catch (error) {
        console.error('Error loading disposal data:', error);
      }
    };

    loadData();
  }, [user]);

  const disposalMethods = [
    'Sale',
    'Donation',
    'Discard',
    'Exchange',
    'Transfer'
  ];

  const disposalReasons = [
    'Technological Obsolescence',
    'End of Useful Life',
    'Irreparable Damage',
    'Equipment Refresh',
    'Lack of Use',
    'Operational Change'
  ];

  const filteredDisposals = disposals.filter(disposal => {
    const matchesSearch = disposal.assetName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         disposal.assetCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !filterStatus || disposal.status === filterStatus;
    const matchesMethod = !filterMethod || disposal.disposalMethod === filterMethod;
    
    return matchesSearch && matchesStatus && matchesMethod;
  });
  
  const totalSaleValue = filteredDisposals.reduce((sum, d) => sum + (d.salePrice || 0), 0);
  const totalBookValue = filteredDisposals.reduce((sum, d) => sum + (d.bookValue || 0), 0);
  const totalGainLoss = filteredDisposals.reduce((sum, d) => sum + (d.gainLoss || 0), 0);

  const handleAddDisposal = () => {
    setEditingDisposal(null);
    setSelectedAssetId('');
    setBookValueInput('');
    setShowModal(true);
  };

  const handleEditDisposal = (disposal: AssetDisposal) => {
    setEditingDisposal(disposal);
    setSelectedAssetId(disposal.assetId);
    setBookValueInput(disposal.bookValue.toString());
    setShowModal(true);
  };

  const handleDeleteDisposal = async (disposalId: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to delete this disposal record?')) return;
    try {
      await assetDisposalService.delete(disposalId);
      setDisposals(prev => prev.filter(d => d.id !== disposalId));
    } catch (error) {
      console.error('Error deleting disposal:', error);
      alert('Error deleting asset disposal');
    }
  };

  const handleApproveDisposal = async (disposalId: string) => {
    if (!user) return;
    const disposal = disposals.find(d => d.id === disposalId);
    if (!disposal) return;
    if (!confirm('Are you sure you want to approve this asset disposal? The related journal entry will be generated.')) return;

    try {
      // Usar el nuevo método que genera el asiento contable automáticamente
      const result = await assetDisposalService.approveWithJournalEntry(user.id, disposalId);

      // Actualizar la lista con los nuevos valores calculados
      setDisposals(prev => prev.map(d => d.id === disposalId ? {
        ...d,
        status: 'Completed',
        gainLoss: result.disposal?.gain_loss ?? d.gainLoss,
        originalCost: result.disposal?.original_cost ?? d.originalCost,
        accumulatedDepreciation: result.disposal?.accumulated_depreciation ?? d.accumulatedDepreciation,
        bookValue: result.disposal?.book_value ?? d.bookValue,
      } : d));

      // Mostrar mensaje de resultado
      if (result.message) {
        alert(result.message);
      }
    } catch (error: any) {
      console.error('Error approving disposal:', error);
      const msg = error?.message || 'Error approving asset disposal';
      alert(msg);
    }
  };

  const handleSaveDisposal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    const assetId = selectedAssetId || String(formData.get('assetId') || '').trim();
    const asset = assets.find(a => a.id === assetId);
    if (!asset) {
      alert('You must select a valid asset');
      return;
    }

    const bookValue = bookValueInput !== '' ? Number(bookValueInput) : asset.bookValue;
    const salePrice = Number(formData.get('salePrice') || 0) || 0;
    const gainLoss = salePrice - bookValue;
    const disposalDate = String(formData.get('disposalDate') || '').trim() || new Date().toISOString().split('T')[0];
    const disposalMethod = String(formData.get('disposalMethod') || '').trim();
    const disposalReason = String(formData.get('disposalReason') || '').trim();

    const buyer = String(formData.get('buyer') || '').trim() || null;
    const authorizedBy = String(formData.get('authorizedBy') || '').trim() || null;
    const status = String(formData.get('status') || 'Pending');

    const notes = String(formData.get('notes') || '').trim() || null;

    const payload: any = {
      asset_id: asset.id,
      asset_code: asset.code,
      asset_name: asset.name,
      category: asset.category,
      original_cost: asset.bookValue + (asset.bookValue - bookValue), // aproximación, puedes ajustarlo si llevas costo original real
      accumulated_depreciation: 0,
      book_value: bookValue,
      disposal_date: disposalDate,
      disposal_method: disposalMethod,
      disposal_reason: disposalReason,
      sale_price: salePrice,
      gain_loss: gainLoss,
      authorized_by: authorizedBy,
      status,
      notes,
      buyer,
    };

    try {
      if (editingDisposal) {
        const updated = await assetDisposalService.update(editingDisposal.id, payload);
        const mapped: AssetDisposal = {
          id: updated.id,
          assetId: updated.asset_id,
          assetCode: updated.asset_code,
          assetName: updated.asset_name,
          category: updated.category,
          originalCost: Number(updated.original_cost) || 0,
          accumulatedDepreciation: Number(updated.accumulated_depreciation) || 0,
          bookValue: Number(updated.book_value) || 0,
          disposalDate: updated.disposal_date,
          disposalMethod: updated.disposal_method,
          disposalReason: updated.disposal_reason,
          salePrice: Number(updated.sale_price) || 0,
          gainLoss: Number(updated.gain_loss) || 0,
          authorizedBy: updated.authorized_by || '',
          status: updated.status,
          notes: updated.notes || '',
          buyer: updated.buyer || '',
        };
        setDisposals(prev => prev.map(d => d.id === editingDisposal.id ? mapped : d));
      } else {
        const created = await assetDisposalService.create(user.id, payload);
        const mapped: AssetDisposal = {
          id: created.id,
          assetId: created.asset_id,
          assetCode: created.asset_code,
          assetName: created.asset_name,
          category: created.category,
          originalCost: Number(created.original_cost) || 0,
          accumulatedDepreciation: Number(created.accumulated_depreciation) || 0,
          bookValue: Number(created.book_value) || 0,
          disposalDate: created.disposal_date,
          disposalMethod: created.disposal_method,
          disposalReason: created.disposal_reason,
          salePrice: Number(created.sale_price) || 0,
          gainLoss: Number(created.gain_loss) || 0,
          authorizedBy: created.authorized_by || '',
          status: created.status,
          notes: created.notes || '',
          buyer: created.buyer || '',
        };
        setDisposals(prev => [mapped, ...prev]);
      }

      setShowModal(false);
      setEditingDisposal(null);
      setSelectedAssetId('');
      setBookValueInput('');
      form.reset();
    } catch (error) {
      console.error('Error saving disposal:', error);
      alert('Error saving asset disposal');
    }
  };

  const exportToExcel = async () => {
    const filteredData = filteredDisposals;

    if (!filteredData || filteredData.length === 0) {
      alert('There are no asset disposals to export.');
      return;
    }

    let companyName = 'ContaBi';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName =
          (info as any).name ||
          (info as any).company_name ||
          (info as any).legal_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      console.error('Error obtaining company information for Excel export:', error);
    }

    const rows = filteredData.map((disposal) => ({
      assetCode: disposal.assetCode,
      assetName: disposal.assetName,
      category: disposal.category,
      originalCost: disposal.originalCost,
      accumulatedDepreciation: disposal.accumulatedDepreciation,
      bookValue: disposal.bookValue,
      disposalDate: new Date(disposal.disposalDate).toLocaleDateString('en-US'),
      disposalMethod: disposal.disposalMethod,
      disposalReason: disposal.disposalReason,
      salePrice: disposal.salePrice,
      gainLoss: disposal.gainLoss,
      buyer: disposal.buyer,
      authorizedBy: disposal.authorizedBy,
      status: disposal.status,
      notes: disposal.notes,
    }));

    const headers = [
      { key: 'assetCode', title: 'Asset Code' },
      { key: 'assetName', title: 'Asset Name' },
      { key: 'category', title: 'Category' },
      { key: 'originalCost', title: 'Original Cost' },
      { key: 'accumulatedDepreciation', title: 'Accumulated Depreciation' },
      { key: 'bookValue', title: 'Book Value' },
      { key: 'disposalDate', title: 'Disposal Date' },
      { key: 'disposalMethod', title: 'Disposal Method' },
      { key: 'disposalReason', title: 'Disposal Reason' },
      { key: 'salePrice', title: 'Sale Price' },
      { key: 'gainLoss', title: 'Gain/Loss' },
      { key: 'buyer', title: 'Buyer/Recipient' },
      { key: 'authorizedBy', title: 'Authorized By' },
      { key: 'status', title: 'Status' },
      { key: 'notes', title: 'Notes' },
    ];

    const fileBase = `asset_disposals_${new Date().toISOString().split('T')[0]}`;
    const title = 'Fixed Asset Disposals';
    const periodText = `Period: ${new Date().toISOString().slice(0, 7)}`;

    exportToExcelWithHeaders(
      rows,
      headers,
      fileBase,
      'Disposals',
      [16, 32, 22, 18, 22, 18, 18, 22, 26, 18, 18, 26, 22, 14, 40],
      {
        title,
        companyName,
        headerStyle: 'dgii_606',
        periodText,
      },
    );
  };

  const formatCurrency = (amount: number) => {
    return formatMoney(amount, 'USD');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate('/fixed-assets')}
              className="flex items-center text-[#3B4A2A] hover:text-[#222D16] mb-2"
            >
              <i className="ri-arrow-left-line mr-1"></i>
              Back to Fixed Assets
            </button>
            <h1 className="text-2xl font-bold text-[#1F2618]">Asset Disposals</h1>
            <p className="text-[#5B6844]">Manage fixed asset disposals and write-offs</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={exportToExcel}
              className="bg-[#3E4D2C] text-white px-4 py-2 rounded-lg hover:bg-[#2D3A1C] transition-colors whitespace-nowrap shadow-md shadow-[#3E4D2C]/20"
            >
              <i className="ri-file-excel-line mr-2"></i>
              Export Excel
            </button>
            <button
              onClick={handleAddDisposal}
              className="bg-[#566738] text-white px-4 py-2 rounded-lg hover:bg-[#45532B] transition-colors whitespace-nowrap shadow-md shadow-[#566738]/20"
            >
              <i className="ri-add-line mr-2"></i>
              New Disposal
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#5B6844]">Total Gain/Loss</p>
                <p className={`text-2xl font-bold ${totalGainLoss >= 0 ? 'text-[#2E4B1D]' : 'text-[#B54848]'}`}>
                  {formatCurrency(totalGainLoss)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[#E1E9C8]">
                <i className="ri-exchange-line text-xl text-[#2E4B1D]"></i>
              </div>
            </div>
          </div>
          <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#5B6844]">Total Sale Value</p>
                <p className="text-2xl font-bold text-[#2F5020]">{formatCurrency(totalSaleValue)}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[#D9E7B5]">
                <i className="ri-money-dollar-circle-line text-xl text-[#2F5020]"></i>
              </div>
            </div>
          </div>
          <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#5B6844]">Book Value</p>
                <p className="text-2xl font-bold text-[#C26127]">{formatCurrency(totalBookValue)}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[#F6E0CC]">
                <i className="ri-book-line text-xl text-[#C26127]"></i>
              </div>
            </div>
          </div>
          <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#5B6844]">Disposed Assets</p>
                <p className="text-2xl font-bold text-[#51476F]">{filteredDisposals.length}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[#ECE6F6]">
                <i className="ri-delete-bin-line text-xl text-[#51476F]"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-[#E0E7C8] p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  placeholder="Search by asset or code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All statuses</option>
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Disposal Method
              </label>
              <select
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All methods</option>
                {disposalMethods.map(method => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterStatus('');
                  setFilterMethod('');
                }}
                className="w-full bg-[#4B5E32] text-white px-4 py-2 rounded-lg hover:bg-[#384726] transition-colors whitespace-nowrap shadow-sm shadow-[#4B5E32]/30"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Disposals Table */}
        <div className="bg-white rounded-lg shadow-sm border border-[#E0E7C8]">
          <div className="p-6 border-b border-[#E0E7C8]">
            <h3 className="text-lg font-semibold text-[#1F2618]">
              Registered Asset Disposals ({filteredDisposals.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#EEF3DE]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#4F5C39] uppercase tracking-wider">
                    Asset
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#4F5C39] uppercase tracking-wider">
                    Book Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#4F5C39] uppercase tracking-wider">
                    Sale Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#4F5C39] uppercase tracking-wider">
                    Gain/Loss
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#4F5C39] uppercase tracking-wider">
                    Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#4F5C39] uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#4F5C39] uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#4F5C39] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDisposals.map((disposal) => (
                  <tr key={disposal.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{disposal.assetName}</div>
                        <div className="text-sm text-gray-500">{disposal.assetCode} - {disposal.category}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(disposal.bookValue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(disposal.salePrice)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <span className={disposal.gainLoss >= 0 ? 'text-[#2F4A21]' : 'text-[#B54848]'}>
                        {disposal.gainLoss >= 0 ? '+' : ''}{formatCurrency(disposal.gainLoss)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {disposal.disposalMethod}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(disposal.disposalDate).toLocaleDateString('en-US')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        disposal.status === 'Completed' ? 'bg-[#D7EBC1] text-[#2E471C]' :
                        disposal.status === 'Pending' ? 'bg-[#F5E7C1] text-[#8A6514]' :
                        disposal.status === 'In Progress' ? 'bg-[#DFE7F3] text-[#2E4B6C]' :
                        'bg-[#F7D8D6] text-[#9F2C2C]'
                      }`}>
                        {disposal.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditDisposal(disposal)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Edit"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        {disposal.status === 'Pending' && (
                          <button
                            onClick={() => handleApproveDisposal(disposal.id)}
                            className="text-green-600 hover:text-green-900"
                            title="Approve"
                          >
                            <i className="ri-check-line"></i>
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteDisposal(disposal.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Disposal Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-[#FDF7EC] rounded-2xl p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/20 border border-[#E8DFC9]">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-[#2B2A22]">
                  {editingDisposal ? 'Edit Asset Disposal' : 'New Asset Disposal'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-[#918773] hover:text-[#6F6654]"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <form onSubmit={handleSaveDisposal} className="space-y-6">
                <div className="grid grid-cols-1 md-grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[#4A4434] mb-2">
                      Asset Code *
                    </label>
                    <select
                      required
                      name="assetId"
                      value={selectedAssetId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedAssetId(id);
                        const asset = assets.find(a => a.id === id);
                        if (asset) {
                          setBookValueInput(asset.bookValue.toString());
                        } else {
                          setBookValueInput('');
                        }
                      }}
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                    >
                      <option value="">Select asset</option>
                      {assets.map(asset => (
                        <option key={asset.id} value={asset.id}>
                          {asset.code} - {asset.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4A4434] mb-2">
                      Book Value *
                    </label>
                    <input
                      type="number" min="0"
                      required
                      step="0.01"
                      name="bookValue"
                      value={bookValueInput}
                      onChange={(e) => setBookValueInput(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4A4434] mb-2">
                      Sale Price
                    </label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      name="salePrice"
                      defaultValue={editingDisposal?.salePrice || ''}
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4A4434] mb-2">
                      Disposal Date *
                    </label>
                    <input
                      type="date"
                      required
                      defaultValue={editingDisposal?.disposalDate || ''}
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4A4434] mb-2">
                      Disposal Method *
                    </label>
                    <select
                      required
                      defaultValue={editingDisposal?.disposalMethod || ''}
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                    >
                      <option value="">Select method</option>
                      {disposalMethods.map(method => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4A4434] mb-2">
                      Disposal Reason *
                    </label>
                    <select
                      required
                      defaultValue={editingDisposal?.disposalReason || ''}
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                    >
                      <option value="">Select reason</option>
                      {disposalReasons.map(reason => (
                        <option key={reason} value={reason}>{reason}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4A4434] mb-2">
                      Buyer/Recipient
                    </label>
                    <input
                      type="text"
                      defaultValue={editingDisposal?.buyer || ''}
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                      placeholder="Buyer or recipient name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4A4434] mb-2">
                      Authorized by *
                    </label>
                    <input
                      type="text"
                      required
                      defaultValue={editingDisposal?.authorizedBy || ''}
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                      placeholder="Authorizer name"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4A4434] mb-2">
                    Notes and Observations
                  </label>
                  <textarea
                    rows={4}
                    defaultValue={editingDisposal?.notes || ''}
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                    placeholder="Additional details about the asset disposal"
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-[#675F4B] bg-[#ECE2CF] rounded-lg hover:bg-[#E0D2BA] transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#927B4E] text-white rounded-lg hover:bg-[#7D683E] transition-colors whitespace-nowrap shadow-md shadow-[#927B4E]/30"
                  >
                    {editingDisposal ? 'Update' : 'Record'} Disposal
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}