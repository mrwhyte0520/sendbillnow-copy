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
    'Venta',
    'Donación',
    'Desecho',
    'Intercambio',
    'Transferencia'
  ];

  const disposalReasons = [
    'Obsolescencia Tecnológica',
    'Fin de Vida Útil',
    'Daño Irreparable',
    'Renovación de Equipos',
    'Falta de Uso',
    'Cambio de Operaciones'
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
    if (!confirm('¿Está seguro de que desea eliminar este registro de baja?')) return;
    try {
      await assetDisposalService.delete(disposalId);
      setDisposals(prev => prev.filter(d => d.id !== disposalId));
    } catch (error) {
      console.error('Error deleting disposal:', error);
      alert('Error al eliminar la baja de activo');
    }
  };

  const handleApproveDisposal = async (disposalId: string) => {
    if (!user) return;
    const disposal = disposals.find(d => d.id === disposalId);
    if (!disposal) return;
    if (!confirm('¿Está seguro de que desea aprobar esta baja de activo? Se generará el asiento contable correspondiente.')) return;

    try {
      // Usar el nuevo método que genera el asiento contable automáticamente
      const result = await assetDisposalService.approveWithJournalEntry(user.id, disposalId);

      // Actualizar la lista con los nuevos valores calculados
      setDisposals(prev => prev.map(d => d.id === disposalId ? {
        ...d,
        status: 'Completado',
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
      const msg = error?.message || 'Error al aprobar la baja de activo';
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
      alert('Debe seleccionar un activo válido');
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
    const status = String(formData.get('status') || 'Pendiente');
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
      alert('Error al guardar la baja de activo');
    }
  };

  const exportToExcel = async () => {
    const filteredData = filteredDisposals;

    if (!filteredData || filteredData.length === 0) {
      alert('No hay bajas de activos para exportar.');
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
      console.error('Error obteniendo información de la empresa para Excel de retiro de activos:', error);
    }

    const rows = filteredData.map((disposal) => ({
      assetCode: disposal.assetCode,
      assetName: disposal.assetName,
      category: disposal.category,
      originalCost: disposal.originalCost,
      accumulatedDepreciation: disposal.accumulatedDepreciation,
      bookValue: disposal.bookValue,
      disposalDate: new Date(disposal.disposalDate).toLocaleDateString('es-DO'),
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
      { key: 'assetCode', title: 'Código Activo' },
      { key: 'assetName', title: 'Nombre del Activo' },
      { key: 'category', title: 'Categoría' },
      { key: 'originalCost', title: 'Costo Original' },
      { key: 'accumulatedDepreciation', title: 'Depreciación Acumulada' },
      { key: 'bookValue', title: 'Valor en Libros' },
      { key: 'disposalDate', title: 'Fecha de Disposición' },
      { key: 'disposalMethod', title: 'Método de Disposición' },
      { key: 'disposalReason', title: 'Motivo de Disposición' },
      { key: 'salePrice', title: 'Precio de Venta' },
      { key: 'gainLoss', title: 'Ganancia/Pérdida' },
      { key: 'buyer', title: 'Comprador/Receptor' },
      { key: 'authorizedBy', title: 'Autorizado Por' },
      { key: 'status', title: 'Estado' },
      { key: 'notes', title: 'Notas' },
    ];

    const fileBase = `retiro_activos_${new Date().toISOString().split('T')[0]}`;
    const title = 'Retiro de Activos Fijos';
    const periodText = `Periodo: ${new Date().toISOString().slice(0, 7)}`;

    exportToExcelWithHeaders(
      rows,
      headers,
      fileBase,
      'Retiros',
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
    return formatMoney(amount, 'RD$');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate('/fixed-assets')}
              className="flex items-center text-blue-600 hover:text-blue-700 mb-2"
            >
              <i className="ri-arrow-left-line mr-1"></i>
              Volver a Activos Fijos
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Retiro de Activos</h1>
            <p className="text-gray-600">Gestión de bajas y disposición de activos fijos</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={exportToExcel}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-excel-line mr-2"></i>
              Exportar Excel
            </button>
            <button
              onClick={handleAddDisposal}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-add-line mr-2"></i>
              Nueva Baja
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ganancia/Pérdida Total</p>
                <p className={`text-2xl font-bold ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(totalGainLoss)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-blue-100">
                <i className="ri-exchange-line text-xl text-blue-600"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Valor de Venta Total</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalSaleValue)}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-green-100">
                <i className="ri-money-dollar-circle-line text-xl text-green-600"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Valor en Libros</p>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalBookValue)}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-orange-100">
                <i className="ri-book-line text-xl text-orange-600"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Activos Dados de Baja</p>
                <p className="text-2xl font-bold text-purple-600">{filteredDisposals.length}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-purple-100">
                <i className="ri-delete-bin-line text-xl text-purple-600"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Buscar
              </label>
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  placeholder="Buscar por activo o código..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Estado
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos los estados</option>
                <option value="Pendiente">Pendiente</option>
                <option value="En Proceso">En Proceso</option>
                <option value="Completado">Completado</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Método de Disposición
              </label>
              <select
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos los métodos</option>
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
                className="w-full bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors whitespace-nowrap"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Disposals Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Bajas de Activos Registradas ({filteredDisposals.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Activo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor en Libros
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Precio de Venta
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ganancia/Pérdida
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Método
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
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
                      <span className={disposal.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {disposal.gainLoss >= 0 ? '+' : ''}{formatCurrency(disposal.gainLoss)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {disposal.disposalMethod}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(disposal.disposalDate).toLocaleDateString('es-DO')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        disposal.status === 'Completado' ? 'bg-green-100 text-green-800' :
                        disposal.status === 'Pendiente' ? 'bg-yellow-100 text-yellow-800' :
                        disposal.status === 'En Proceso' ? 'bg-blue-100 text-blue-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {disposal.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditDisposal(disposal)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Editar"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        {disposal.status === 'Pendiente' && (
                          <button
                            onClick={() => handleApproveDisposal(disposal.id)}
                            className="text-green-600 hover:text-green-900"
                            title="Aprobar"
                          >
                            <i className="ri-check-line"></i>
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteDisposal(disposal.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Eliminar"
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingDisposal ? 'Editar Baja de Activo' : 'Nueva Baja de Activo'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <form onSubmit={handleSaveDisposal} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Código del Activo *
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar activo</option>
                      {assets.map(asset => (
                        <option key={asset.id} value={asset.id}>
                          {asset.code} - {asset.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Valor en Libros *
                    </label>
                    <input
                      type="number" min="0"
                      required
                      step="0.01"
                      name="bookValue"
                      value={bookValueInput}
                      onChange={(e) => setBookValueInput(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Precio de Venta
                    </label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      name="salePrice"
                      defaultValue={editingDisposal?.salePrice || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha de Disposición *
                    </label>
                    <input
                      type="date"
                      required
                      defaultValue={editingDisposal?.disposalDate || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Método de Disposición *
                    </label>
                    <select
                      required
                      defaultValue={editingDisposal?.disposalMethod || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar método</option>
                      {disposalMethods.map(method => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Motivo de Disposición *
                    </label>
                    <select
                      required
                      defaultValue={editingDisposal?.disposalReason || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar motivo</option>
                      {disposalReasons.map(reason => (
                        <option key={reason} value={reason}>{reason}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Comprador/Receptor
                    </label>
                    <input
                      type="text"
                      defaultValue={editingDisposal?.buyer || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Nombre del comprador o receptor"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Autorizado por *
                    </label>
                    <input
                      type="text"
                      required
                      defaultValue={editingDisposal?.authorizedBy || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Nombre del autorizador"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notas y Observaciones
                  </label>
                  <textarea
                    rows={4}
                    defaultValue={editingDisposal?.notes || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Detalles adicionales sobre la disposición del activo"
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    {editingDisposal ? 'Actualizar' : 'Registrar'} Baja
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