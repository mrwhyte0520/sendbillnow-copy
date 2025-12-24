import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { fixedAssetsService, revaluationService, assetTypesService, chartAccountsService, journalEntriesService, settingsService } from '../../../services/database';
import { exportToExcelWithHeaders } from '../../../utils/exportImportUtils';
import { formatMoney } from '../../../utils/numberFormat';

interface Revaluation {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  category: string;
  originalValue: number;
  previousValue: number;
  newValue: number;
  revaluationAmount: number;
  revaluationDate: string;
  reason: string;
  method: string;
  appraiser: string;
  status: string;
  approvedBy: string;
  notes: string;
}

interface AssetOption {
  id: string;
  code: string;
  name: string;
  category: string;
  currentValue: number;
}

export default function RevaluationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editingRevaluation, setEditingRevaluation] = useState<Revaluation | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterReason, setFilterReason] = useState('');

  const [revaluations, setRevaluations] = useState<Revaluation[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [previousValueInput, setPreviousValueInput] = useState<string>('');

  const createRevaluationJournalEntry = async (params: {
    assetId: string;
    assetCode: string;
    assetName: string;
    category: string;
    previousValue: number;
    newValue: number;
    revaluationAmount: number;
    revaluationDate: string;
    reason: string;
  }) => {
    if (!user?.id) return;

    const {
      assetId,
      assetCode,
      assetName,
      category,
      previousValue,
      newValue,
      revaluationAmount,
      revaluationDate,
      reason,
    } = params;

    if (Math.abs(revaluationAmount) < 0.01) {
      return;
    }

    try {
      const [assetTypes, accounts] = await Promise.all([
        assetTypesService.getAll(user.id),
        chartAccountsService.getAll(user.id),
      ]);

      const assetType = (assetTypes || []).find((t: any) => String(t.name || '') === category);
      if (!assetType) {
        console.error('No se encontró el tipo de activo para la categoría', category);
        return;
      }

      const extractCode = (value?: string | null) => {
        if (!value) return null;
        const [codePart] = String(value).split(' - ');
        return codePart.trim();
      };

      const assetAccountCode = extractCode(assetType.account);
      const gainAccountCode = extractCode(assetType.revaluation_gain_account);
      const lossAccountCode = extractCode(assetType.revaluation_loss_account);

      const accountsByCode = new Map<string, string>();
      (accounts || []).forEach((acc: any) => {
        if (acc.code && acc.id) {
          accountsByCode.set(String(acc.code), String(acc.id));
        }
      });

      const assetAccountId = assetAccountCode ? accountsByCode.get(assetAccountCode) : undefined;
      const gainAccountId = gainAccountCode ? accountsByCode.get(gainAccountCode) : undefined;
      const lossAccountId = lossAccountCode ? accountsByCode.get(lossAccountCode) : undefined;

      if (!assetAccountId) {
        console.error(`No se encontró en el catálogo la cuenta de activo para el tipo ${category}.`);
        return;
      }

      const lines: any[] = [];
      let lineNumber = 1;
      const descriptionBase = `Revalorización activo ${assetCode} - ${assetName}`;
      const absAmount = Math.abs(revaluationAmount);

      if (revaluationAmount > 0) {
        if (!gainAccountId) {
          console.error('No se configuró la cuenta de ganancia por revalorización para este tipo de activo.');
          return;
        }

        lines.push({
          account_id: assetAccountId,
          description: descriptionBase,
          debit_amount: absAmount,
          credit_amount: 0,
          line_number: lineNumber++,
        });

        lines.push({
          account_id: gainAccountId,
          description: descriptionBase,
          debit_amount: 0,
          credit_amount: absAmount,
          line_number: lineNumber++,
        });
      } else if (revaluationAmount < 0) {
        if (!lossAccountId) {
          console.error('No se configuró la cuenta de pérdida por revalorización para este tipo de activo.');
          return;
        }

        lines.push({
          account_id: lossAccountId,
          description: descriptionBase,
          debit_amount: absAmount,
          credit_amount: 0,
          line_number: lineNumber++,
        });

        lines.push({
          account_id: assetAccountId,
          description: descriptionBase,
          debit_amount: 0,
          credit_amount: absAmount,
          line_number: lineNumber++,
        });
      } else {
        return;
      }

      const entryDate = revaluationDate || new Date().toISOString().split('T')[0];
      const period = entryDate.slice(0, 7).replace('-', '');
      const sanitizedCode = assetCode.replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || assetId.slice(0, 6);
      const entryNumber = `RV-${period}-${sanitizedCode}`;

      const entryPayload = {
        entry_number: entryNumber,
        entry_date: entryDate,
        description: descriptionBase,
        reference: `Revalorización - ${reason}`,
        status: 'posted' as const,
      };

      await journalEntriesService.createWithLines(user.id, entryPayload, lines);
    } catch (error) {
      console.error('Error creating revaluation journal entry:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      try {
        const [revalData, assetsData] = await Promise.all([
          revaluationService.getAll(user.id),
          fixedAssetsService.getAll(user.id),
        ]);

        const mappedRevals: Revaluation[] = (revalData || []).map((r: any) => ({
          id: r.id,
          assetId: r.asset_id,
          assetCode: r.asset_code,
          assetName: r.asset_name,
          category: r.category,
          originalValue: Number(r.original_value) || 0,
          previousValue: Number(r.previous_value) || 0,
          newValue: Number(r.new_value) || 0,
          revaluationAmount: Number(r.revaluation_amount) || 0,
          revaluationDate: r.revaluation_date,
          reason: r.reason,
          method: r.method,
          appraiser: r.appraiser || '',
          status: r.status,
          approvedBy: r.approved_by || '',
          notes: r.notes || '',
        }));
        setRevaluations(mappedRevals);

        const mappedAssets: AssetOption[] = (assetsData || []).map((a: any) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          category: a.category || '',
          currentValue: Number(a.current_value) || 0,
        }));
        setAssets(mappedAssets);
      } catch (error) {
        console.error('Error loading revaluation data:', error);
      }
    };

    loadData();
  }, [user]);

  const revaluationReasons = [
    'Incremento del Mercado',
    'Mejoras y Actualizaciones',
    'Obsolescencia Tecnológica',
    'Deterioro Físico',
    'Cambios Regulatorios',
    'Ajuste por Inflación'
  ];

  const revaluationMethods = [
    'Avalúo Profesional',
    'Valor de Mercado',
    'Costo de Reposición',
    'Valor Presente Neto',
    'Comparación de Ventas'
  ];

  const filteredRevaluations = revaluations.filter(rev => {
    const matchesSearch = rev.assetName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         rev.assetCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !filterStatus || rev.status === filterStatus;
    const matchesReason = !filterReason || rev.reason === filterReason;
    
    return matchesSearch && matchesStatus && matchesReason;
  });

  const totalRevaluationAmount = filteredRevaluations.reduce((sum, rev) => sum + rev.revaluationAmount, 0);
  const positiveRevaluations = filteredRevaluations.filter(rev => rev.revaluationAmount > 0);
  const negativeRevaluations = filteredRevaluations.filter(rev => rev.revaluationAmount < 0);

  const handleAddRevaluation = () => {
    setEditingRevaluation(null);
    setSelectedAssetId('');
    setPreviousValueInput('');
    setShowModal(true);
  };

  const handleEditRevaluation = (revaluation: Revaluation) => {
    setEditingRevaluation(revaluation);
    setSelectedAssetId(revaluation.assetId);
    setPreviousValueInput(revaluation.previousValue.toString());
    setShowModal(true);
  };

  const handleSaveRevaluation = async (e: React.FormEvent<HTMLFormElement>) => {
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

    const previousValue = previousValueInput !== ''
      ? Number(previousValueInput)
      : Number(asset.currentValue || 0);
    const newValue = Number(formData.get('newValue') || 0) || 0;
    const revaluationAmount = newValue - previousValue;
    const revaluationDate = String(formData.get('revaluationDate') || '').trim() || new Date().toISOString().split('T')[0];
    const reason = String(formData.get('reason') || '').trim();
    const method = String(formData.get('method') || '').trim();
    const appraiser = String(formData.get('appraiser') || '').trim() || null;
    const status = String(formData.get('status') || 'Pendiente');
    const notes = String(formData.get('notes') || '').trim() || null;

    const payload: any = {
      asset_id: asset.id,
      asset_code: asset.code,
      asset_name: asset.name,
      category: asset.category,
      original_value: asset.currentValue,
      previous_value: previousValue,
      new_value: newValue,
      revaluation_amount: revaluationAmount,
      revaluation_date: revaluationDate,
      reason,
      method,
      appraiser,
      status,
      approved_by: null,
      notes,
    };

    try {
      if (editingRevaluation) {
        const updated = await revaluationService.update(editingRevaluation.id, payload);

        // Si se guarda como Aprobado desde el formulario, actualizar valor actual del activo
        if (status === 'Aprobado') {
          await fixedAssetsService.update(asset.id, {
            current_value: newValue,
          });
          // Actualizar también el estado local de assets para futuras revalorizaciones
          setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, currentValue: newValue } : a));

          if (editingRevaluation.status !== 'Aprobado') {
            await createRevaluationJournalEntry({
              assetId: asset.id,
              assetCode: asset.code,
              assetName: asset.name,
              category: asset.category,
              previousValue,
              newValue,
              revaluationAmount,
              revaluationDate,
              reason,
            });
          }
        }

        const mapped: Revaluation = {
          id: updated.id,
          assetId: updated.asset_id,
          assetCode: updated.asset_code,
          assetName: updated.asset_name,
          category: updated.category,
          originalValue: Number(updated.original_value) || 0,
          previousValue: Number(updated.previous_value) || 0,
          newValue: Number(updated.new_value) || 0,
          revaluationAmount: Number(updated.revaluation_amount) || 0,
          revaluationDate: updated.revaluation_date,
          reason: updated.reason,
          method: updated.method,
          appraiser: updated.appraiser || '',
          status: updated.status,
          approvedBy: updated.approved_by || '',
          notes: updated.notes || '',
        };
        setRevaluations(prev => prev.map(r => r.id === editingRevaluation.id ? mapped : r));
      } else {
        const created = await revaluationService.create(user.id, payload);

        // Si se crea directamente como Aprobado, actualizar valor actual del activo
        if (status === 'Aprobado') {
          await fixedAssetsService.update(asset.id, {
            current_value: newValue,
          });
          // Actualizar también el estado local de assets para futuras revalorizaciones
          setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, currentValue: newValue } : a));

          await createRevaluationJournalEntry({
            assetId: asset.id,
            assetCode: asset.code,
            assetName: asset.name,
            category: asset.category,
            previousValue,
            newValue,
            revaluationAmount,
            revaluationDate,
            reason,
          });
        }

        const mapped: Revaluation = {
          id: created.id,
          assetId: created.asset_id,
          assetCode: created.asset_code,
          assetName: created.asset_name,
          category: created.category,
          originalValue: Number(created.original_value) || 0,
          previousValue: Number(created.previous_value) || 0,
          newValue: Number(created.new_value) || 0,
          revaluationAmount: Number(created.revaluation_amount) || 0,
          revaluationDate: created.revaluation_date,
          reason: created.reason,
          method: created.method,
          appraiser: created.appraiser || '',
          status: created.status,
          approvedBy: created.approved_by || '',
          notes: created.notes || '',
        };
        setRevaluations(prev => [mapped, ...prev]);
      }

      setShowModal(false);
      setEditingRevaluation(null);
      setSelectedAssetId('');
      setPreviousValueInput('');
      form.reset();
    } catch (error) {
      console.error('Error saving revaluation:', error);
      alert('Error al guardar la revalorización');
    }
  };

  const handleApproveRevaluation = async (revaluationId: string) => {
    if (!user) return;
    const rev = revaluations.find(r => r.id === revaluationId);
    if (!rev) return;
    if (rev.status === 'Aprobado') return;
    if (!confirm('¿Está seguro de que desea aprobar esta revalorización?')) return;

    try {
      // Actualizar revalorización a Aprobado
      const payload: any = {
        asset_id: rev.assetId,
        asset_code: rev.assetCode,
        asset_name: rev.assetName,
        category: rev.category,
        original_value: rev.originalValue,
        previous_value: rev.previousValue,
        new_value: rev.newValue,
        revaluation_amount: rev.revaluationAmount,
        revaluation_date: rev.revaluationDate,
        reason: rev.reason,
        method: rev.method,
        appraiser: rev.appraiser || null,
        status: 'Aprobado',
        approved_by: rev.approvedBy || null,
        notes: rev.notes || null,
      };
      const updated = await revaluationService.update(revaluationId, payload);

      // Actualizar el valor actual del activo en fixed_assets
      await fixedAssetsService.update(rev.assetId, {
        current_value: rev.newValue,
      });

      // Sincronizar el estado local de assets para que la próxima revalorización use el nuevo valor
      setAssets(prev => prev.map(a => a.id === rev.assetId ? { ...a, currentValue: rev.newValue } : a));

      setRevaluations(prev => prev.map(r => r.id === revaluationId ? { ...r, status: updated.status || 'Aprobado' } : r));

      await createRevaluationJournalEntry({
        assetId: rev.assetId,
        assetCode: rev.assetCode,
        assetName: rev.assetName,
        category: rev.category,
        previousValue: rev.previousValue,
        newValue: rev.newValue,
        revaluationAmount: rev.revaluationAmount,
        revaluationDate: rev.revaluationDate,
        reason: rev.reason,
      });
    } catch (error) {
      console.error('Error approving revaluation:', error);
      alert('Error al aprobar la revalorización');
    }
  };

  const handleRejectRevaluation = async (revaluationId: string) => {
    if (!user) return;
    const rev = revaluations.find(r => r.id === revaluationId);
    if (!rev) return;
    if (!confirm('¿Está seguro de que desea rechazar esta revalorización?')) return;

    try {
      const payload: any = {
        asset_id: rev.assetId,
        asset_code: rev.assetCode,
        asset_name: rev.assetName,
        category: rev.category,
        original_value: rev.originalValue,
        previous_value: rev.previousValue,
        new_value: rev.newValue,
        revaluation_amount: rev.revaluationAmount,
        revaluation_date: rev.revaluationDate,
        reason: rev.reason,
        method: rev.method,
        appraiser: rev.appraiser || null,
        status: 'Rechazado',
        approved_by: rev.approvedBy || null,
        notes: rev.notes || null,
      };
      const updated = await revaluationService.update(revaluationId, payload);
      setRevaluations(prev => prev.map(r => r.id === revaluationId ? { ...r, status: updated.status || 'Rechazado' } : r));
    } catch (error) {
      console.error('Error rejecting revaluation:', error);
      alert('Error al rechazar la revalorización');
    }
  };

  const handleDeleteRevaluation = async (revaluationId: string) => {
    if (!user) return;
    const rev = revaluations.find(r => r.id === revaluationId);
    if (!rev) return;
    if (!confirm('¿Está seguro de que desea eliminar esta revalorización?')) return;

    try {
      await revaluationService.delete(revaluationId);
      setRevaluations(prev => prev.filter(r => r.id !== revaluationId));
    } catch (error) {
      console.error('Error deleting revaluation:', error);
      alert('Error al eliminar la revalorización');
    }
  };

  const exportToExcel = async () => {
    // Preparar datos para Excel
    const filteredData = filteredRevaluations;

    if (!filteredData || filteredData.length === 0) {
      alert('No hay revalorizaciones para exportar.');
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
      // eslint-disable-next-line no-console
      console.error('Error obteniendo información de la empresa para Excel de revalorizaciones:', error);
    }

    const rows = filteredData.map((rev) => ({
      assetCode: rev.assetCode,
      assetName: rev.assetName,
      category: rev.category,
      originalValue: rev.originalValue,
      previousValue: rev.previousValue,
      newValue: rev.newValue,
      revaluationAmount: rev.revaluationAmount,
      revaluationDate: new Date(rev.revaluationDate).toLocaleDateString('es-DO'),
      reason: rev.reason,
      method: rev.method,
      appraiser: rev.appraiser,
      status: rev.status,
      approvedBy: rev.approvedBy,
      notes: rev.notes,
    }));

    const headers = [
      { key: 'assetCode', title: 'Código Activo' },
      { key: 'assetName', title: 'Nombre del Activo' },
      { key: 'category', title: 'Categoría' },
      { key: 'originalValue', title: 'Valor Original' },
      { key: 'previousValue', title: 'Valor Anterior' },
      { key: 'newValue', title: 'Nuevo Valor' },
      { key: 'revaluationAmount', title: 'Monto Revalorización' },
      { key: 'revaluationDate', title: 'Fecha Revalorización' },
      { key: 'reason', title: 'Motivo' },
      { key: 'method', title: 'Método Evaluación' },
      { key: 'appraiser', title: 'Evaluador/Tasador' },
      { key: 'status', title: 'Estado' },
      { key: 'approvedBy', title: 'Aprobado Por' },
      { key: 'notes', title: 'Notas' },
    ];

    const fileBase = `revalorizaciones_${new Date().toISOString().split('T')[0]}`;
    const title = 'Revalorización de Activos Fijos';
    const periodText = `Periodo: ${new Date().toISOString().slice(0, 7)}`;

    exportToExcelWithHeaders(
      rows,
      headers,
      fileBase,
      'Revalorizaciones',
      [16, 32, 22, 18, 18, 18, 20, 18, 24, 24, 24, 14, 20, 40],
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
            <h1 className="text-2xl font-bold text-gray-900">Revalorización de Activos</h1>
            <p className="text-gray-600">Gestión de revalorizaciones y ajustes de valor</p>
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
              onClick={handleAddRevaluation}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-add-line mr-2"></i>
              Nueva Revalorización
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Revalorización Total</p>
                <p className={`text-2xl font-bold ${totalRevaluationAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(totalRevaluationAmount)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-blue-100">
                <i className="ri-trending-up-line text-xl text-blue-600"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Incrementos</p>
                <p className="text-2xl font-bold text-green-600">{positiveRevaluations.length}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-green-100">
                <i className="ri-arrow-up-line text-xl text-green-600"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Decrementos</p>
                <p className="text-2xl font-bold text-red-600">{negativeRevaluations.length}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-red-100">
                <i className="ri-arrow-down-line text-xl text-red-600"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Revalorizaciones</p>
                <p className="text-2xl font-bold text-purple-600">{filteredRevaluations.length}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-purple-100">
                <i className="ri-refresh-line text-xl text-purple-600"></i>
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
                <option value="En Revisión">En Revisión</option>
                <option value="Aprobado">Aprobado</option>
                <option value="Rechazado">Rechazado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Motivo
              </label>
              <select
                value={filterReason}
                onChange={(e) => setFilterReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos los motivos</option>
                {revaluationReasons.map(reason => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterStatus('');
                  setFilterReason('');
                }}
                className="w-full bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors whitespace-nowrap"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Revaluations Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Revalorizaciones Registradas ({filteredRevaluations.length})
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
                    Valor Anterior
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nuevo Valor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Revalorización
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Motivo
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
                {filteredRevaluations.map((revaluation) => (
                  <tr key={revaluation.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{revaluation.assetName}</div>
                        <div className="text-sm text-gray-500">{revaluation.assetCode} - {revaluation.category}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(revaluation.previousValue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(revaluation.newValue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <span className={revaluation.revaluationAmount >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {revaluation.revaluationAmount >= 0 ? '+' : ''}{formatCurrency(revaluation.revaluationAmount)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {revaluation.reason}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(revaluation.revaluationDate).toLocaleDateString('es-DO')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        revaluation.status === 'Aprobado' ? 'bg-green-100 text-green-800' :
                        revaluation.status === 'Pendiente' ? 'bg-yellow-100 text-yellow-800' :
                        revaluation.status === 'En Revisión' ? 'bg-blue-100 text-blue-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {revaluation.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditRevaluation(revaluation)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Editar"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        {revaluation.status === 'Pendiente' && (
                          <>
                            <button
                              onClick={() => handleApproveRevaluation(revaluation.id)}
                              className="text-green-600 hover:text-green-900"
                              title="Aprobar"
                            >
                              <i className="ri-check-line"></i>
                            </button>
                            <button
                              onClick={() => handleRejectRevaluation(revaluation.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Rechazar"
                            >
                              <i className="ri-close-line"></i>
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDeleteRevaluation(revaluation.id)}
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

        {/* Revaluation Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingRevaluation ? 'Editar Revalorización' : 'Nueva Revalorización'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <form onSubmit={handleSaveRevaluation} className="space-y-6">
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
                          setPreviousValueInput(asset.currentValue.toString());
                        } else {
                          setPreviousValueInput('');
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
                      Valor Anterior *
                    </label>
                    <input
                      type="number" min="0"
                      required
                      step="0.01"
                      name="previousValue"
                      value={previousValueInput}
                      onChange={(e) => setPreviousValueInput(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nuevo Valor *
                    </label>
                    <input
                      type="number" min="0"
                      required
                      step="0.01"
                      name="newValue"
                      defaultValue={editingRevaluation?.newValue || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha de Revalorización *
                    </label>
                    <input
                      type="date"
                      required
                      name="revaluationDate"
                      defaultValue={editingRevaluation?.revaluationDate || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Motivo de Revalorización *
                    </label>
                    <select
                      required
                      name="reason"
                      defaultValue={editingRevaluation?.reason || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar motivo</option>
                      {revaluationReasons.map(reason => (
                        <option key={reason} value={reason}>{reason}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Método de Evaluación *
                    </label>
                    <select
                      required
                      name="method"
                      defaultValue={editingRevaluation?.method || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar método</option>
                      {revaluationMethods.map(method => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Evaluador/Tasador
                    </label>
                    <input
                      type="text"
                      name="appraiser"
                      defaultValue={editingRevaluation?.appraiser || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Nombre del evaluador"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Estado
                    </label>
                    <select
                      name="status"
                      defaultValue={editingRevaluation?.status || 'Pendiente'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Pendiente">Pendiente</option>
                      <option value="En Revisión">En Revisión</option>
                      <option value="Aprobado">Aprobado</option>
                      <option value="Rechazado">Rechazado</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notas y Observaciones
                  </label>
                  <textarea
                    rows={4}
                    name="notes"
                    defaultValue={editingRevaluation?.notes || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Detalles adicionales sobre la revalorización"
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
                    {editingRevaluation ? 'Actualizar' : 'Registrar'} Revalorización
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