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
        console.error('Asset type not found for category', category);
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
        console.error(`Asset account not found in chart for type ${category}.`);
        return;
      }

      const lines: any[] = [];
      let lineNumber = 1;
      const descriptionBase = `Asset revaluation ${assetCode} - ${assetName}`;
      const absAmount = Math.abs(revaluationAmount);

      if (revaluationAmount > 0) {
        if (!gainAccountId) {
          console.error('Revaluation gain account is not configured for this asset type.');
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
          console.error('Revaluation loss account is not configured for this asset type.');
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
        reference: `Revaluation - ${reason}`,
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
    { value: 'Incremento del Mercado', label: 'Market Increase' },
    { value: 'Mejoras y Actualizaciones', label: 'Improvements and Upgrades' },
    { value: 'Obsolescencia Tecnológica', label: 'Technological Obsolescence' },
    { value: 'Deterioro Físico', label: 'Physical Deterioration' },
    { value: 'Cambios Regulatorios', label: 'Regulatory Changes' },
    { value: 'Ajuste por Inflación', label: 'Inflation Adjustment' },
  ];

  const revaluationMethods = [
    { value: 'Avalúo Profesional', label: 'Professional Appraisal' },
    { value: 'Valor de Mercado', label: 'Market Value' },
    { value: 'Costo de Reposición', label: 'Replacement Cost' },
    { value: 'Valor Presente Neto', label: 'Net Present Value' },
    { value: 'Comparación de Ventas', label: 'Sales Comparison' },
  ];

  const statusOptions = [
    { value: 'Pendiente', label: 'Pending' },
    { value: 'En Revisión', label: 'Under Review' },
    { value: 'Aprobado', label: 'Approved' },
    { value: 'Rechazado', label: 'Rejected' },
  ];

  const getReasonLabel = (value: string) =>
    revaluationReasons.find((reason) => reason.value === value)?.label || value;

  const getMethodLabel = (value: string) =>
    revaluationMethods.find((method) => method.value === value)?.label || value;

  const getStatusLabel = (value: string) =>
    statusOptions.find((status) => status.value === value)?.label || value;

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
      alert('Please select a valid asset.');
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

        // If it is saved as Approved from the form, update the asset current value
        if (status === 'Aprobado') {
          await fixedAssetsService.update(asset.id, {
            current_value: newValue,
          });
          // Update local asset state for future revaluations
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

        // If it is saved as Approved from the form, update the asset current value
        if (status === 'Aprobado') {
          await fixedAssetsService.update(asset.id, {
            current_value: newValue,
          });
          // Update local asset state for future revaluations
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
      alert('Error saving the revaluation.');
    }
  };

  const handleApproveRevaluation = async (revaluationId: string) => {
    if (!user) return;
    const rev = revaluations.find(r => r.id === revaluationId);
    if (!rev) return;
    if (rev.status === 'Aprobado') return;
    if (!confirm('Are you sure you want to approve this revaluation?')) return;

    try {
      // Update revaluation to Approved
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

      // Update asset current value
      await fixedAssetsService.update(rev.assetId, {
        current_value: rev.newValue,
      });

      // Update local asset state for future revaluations
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
      alert('Error approving the revaluation.');
    }
  };

  const handleRejectRevaluation = async (revaluationId: string) => {
    if (!user) return;
    const rev = revaluations.find(r => r.id === revaluationId);
    if (!rev) return;
    if (!confirm('Are you sure you want to reject this revaluation?')) return;

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
      alert('Error rejecting the revaluation.');
    }
  };

  const handleDeleteRevaluation = async (revaluationId: string) => {
    if (!user) return;
    const rev = revaluations.find(r => r.id === revaluationId);
    if (!rev) return;
    if (!confirm('Are you sure you want to delete this revaluation?')) return;

    try {
      await revaluationService.delete(revaluationId);
      setRevaluations(prev => prev.filter(r => r.id !== revaluationId));
    } catch (error) {
      console.error('Error deleting revaluation:', error);
      alert('Error deleting the revaluation.');
    }
  };

  const exportToExcel = async () => {
    // Prepare data for Excel
    const filteredData = filteredRevaluations;

    if (!filteredData || filteredData.length === 0) {
      alert('There are no revaluations to export.');
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
      console.error('Error getting company info for revaluation Excel:', error);
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
      reason: getReasonLabel(rev.reason),
      method: getMethodLabel(rev.method),
      appraiser: rev.appraiser,
      status: getStatusLabel(rev.status),
      approvedBy: rev.approvedBy,
      notes: rev.notes,
    }));

    const headers = [
      { key: 'assetCode', title: 'Asset Code' },
      { key: 'assetName', title: 'Asset Name' },
      { key: 'category', title: 'Category' },
      { key: 'originalValue', title: 'Original Value' },
      { key: 'previousValue', title: 'Previous Value' },
      { key: 'newValue', title: 'New Value' },
      { key: 'revaluationAmount', title: 'Revaluation Amount' },
      { key: 'revaluationDate', title: 'Revaluation Date' },
      { key: 'reason', title: 'Reason' },
      { key: 'method', title: 'Method' },
      { key: 'appraiser', title: 'Appraiser' },
      { key: 'status', title: 'Status' },
      { key: 'approvedBy', title: 'Approved By' },
      { key: 'notes', title: 'Notes' },
    ];

    const fileBase = `revaluations_${new Date().toISOString().split('T')[0]}`;
    const title = 'Asset Revaluation';
    const periodText = `Period: ${new Date().toISOString().slice(0, 7)}`;

    exportToExcelWithHeaders(
      rows,
      headers,
      fileBase,
      'Revaluations',
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
              className="flex items-center text-[#3B4A2A] hover:text-[#222D16] mb-2"
            >
              <i className="ri-arrow-left-line mr-1"></i>
              Back to Fixed Assets
            </button>
            <h1 className="text-2xl font-bold text-[#1F2618]">Asset Revaluation</h1>
            <p className="text-[#5B6844]">Manage revaluations and value adjustments</p>
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
              onClick={handleAddRevaluation}
              className="bg-[#566738] text-white px-4 py-2 rounded-lg hover:bg-[#45532B] transition-colors whitespace-nowrap shadow-md shadow-[#566738]/20"
            >
              <i className="ri-add-line mr-2"></i>
              New Revaluation
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#5B6844]">Total Revaluation</p>
                <p className={`text-2xl font-bold ${totalRevaluationAmount >= 0 ? 'text-[#2E4B1D]' : 'text-[#B54848]'}`}>
                  {formatCurrency(totalRevaluationAmount)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[#E1E9C8]">
                <i className="ri-trending-up-line text-xl text-[#2E4B1D]"></i>
              </div>
            </div>
          </div>
          <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#5B6844]">Increases</p>
                <p className="text-2xl font-bold text-[#2F5020]">{positiveRevaluations.length}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[#D9E7B5]">
                <i className="ri-arrow-up-line text-xl text-[#2F5020]"></i>
              </div>
            </div>
          </div>
          <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#5B6844]">Decreases</p>
                <p className="text-2xl font-bold text-[#B54848]">{negativeRevaluations.length}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[#F7E0DF]">
                <i className="ri-arrow-down-line text-xl text-[#B54848]"></i>
              </div>
            </div>
          </div>
          <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#5B6844]">Total Revaluations</p>
                <p className="text-2xl font-bold text-[#51476F]">{filteredRevaluations.length}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[#ECE6F6]">
                <i className="ri-refresh-line text-xl text-[#51476F]"></i>
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
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason
              </label>
              <select
                value={filterReason}
                onChange={(e) => setFilterReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All reasons</option>
                {revaluationReasons.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
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
                className="w-full bg-[#4B5E32] text-white px-4 py-2 rounded-lg hover:bg-[#384726] transition-colors whitespace-nowrap shadow-sm shadow-[#4B5E32]/30"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Revaluations Table */}
        <div className="bg-white rounded-lg shadow-sm border border-[#E0E7C8]">
          <div className="p-6 border-b border-[#E0E7C8]">
            <h3 className="text-lg font-semibold text-[#1F2618]">
              Registered Revaluations ({filteredRevaluations.length})
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
                    Previous Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#4F5C39] uppercase tracking-wider">
                    New Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#4F5C39] uppercase tracking-wider">
                    Revaluation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#4F5C39] uppercase tracking-wider">
                    Reason
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
                      <span className={revaluation.revaluationAmount >= 0 ? 'text-[#2F4A21]' : 'text-[#B54848]'}>
                        {revaluation.revaluationAmount >= 0 ? '+' : ''}{formatCurrency(revaluation.revaluationAmount)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {getReasonLabel(revaluation.reason)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(revaluation.revaluationDate).toLocaleDateString('es-DO')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        revaluation.status === 'Aprobado' ? 'bg-[#D7EBC1] text-[#2E471C]' :
                        revaluation.status === 'Pendiente' ? 'bg-[#F5E7C1] text-[#8A6514]' :
                        revaluation.status === 'En Revisión' ? 'bg-[#DFE7F3] text-[#2E4B6C]' :
                        'bg-[#F7D8D6] text-[#9F2C2C]'
                      }`}>
                        {getStatusLabel(revaluation.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditRevaluation(revaluation)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Edit"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        {revaluation.status === 'Pendiente' && (
                          <>
                            <button
                              onClick={() => handleApproveRevaluation(revaluation.id)}
                              className="text-green-600 hover:text-green-900"
                              title="Approve"
                            >
                              <i className="ri-check-line"></i>
                            </button>
                            <button
                              onClick={() => handleRejectRevaluation(revaluation.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Reject"
                            >
                              <i className="ri-close-line"></i>
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDeleteRevaluation(revaluation.id)}
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

        {/* Revaluation Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-[#FDF7EC] rounded-2xl p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/20 border border-[#E8DFC9]">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-[#2B2A22]">
                  {editingRevaluation ? 'Edit Revaluation' : 'New Revaluation'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-[#918773] hover:text-[#6F6654]"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <form onSubmit={handleSaveRevaluation} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                          setPreviousValueInput(asset.currentValue.toString());
                        } else {
                          setPreviousValueInput('');
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
                      Previous Value *
                    </label>
                    <input
                      type="number" min="0"
                      required
                      step="0.01"
                      name="previousValue"
                      value={previousValueInput}
                      onChange={(e) => setPreviousValueInput(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4A4434] mb-2">
                      New Value *
                    </label>
                    <input
                      type="number" min="0"
                      required
                      step="0.01"
                      name="newValue"
                      defaultValue={editingRevaluation?.newValue || ''}
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4A4434] mb-2">
                      Revaluation Date *
                    </label>
                    <input
                      type="date"
                      required
                      name="revaluationDate"
                      defaultValue={editingRevaluation?.revaluationDate || ''}
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4A4434] mb-2">
                      Revaluation Reason *
                    </label>
                    <select
                      required
                      name="reason"
                      defaultValue={editingRevaluation?.reason || ''}
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                    >
                      <option value="">Select reason</option>
                      {revaluationReasons.map(reason => (
                        <option key={reason.value} value={reason.value}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4A4434] mb-2">
                      Valuation Method *
                    </label>
                    <select
                      required
                      name="method"
                      defaultValue={editingRevaluation?.method || ''}
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                    >
                      <option value="">Select method</option>
                      {revaluationMethods.map(method => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4A4434] mb-2">
                      Appraiser
                    </label>
                    <input
                      type="text"
                      name="appraiser"
                      defaultValue={editingRevaluation?.appraiser || ''}
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                      placeholder="Appraiser name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4A4434] mb-2">
                      Status
                    </label>
                    <select
                      name="status"
                      defaultValue={editingRevaluation?.status || 'Pendiente'}
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                    >
                      {statusOptions.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4A4434] mb-2">
                    Notes and Comments
                  </label>
                  <textarea
                    rows={4}
                    name="notes"
                    defaultValue={editingRevaluation?.notes || ''}
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white text-[#2B2A22]"
                    placeholder="Additional revaluation details"
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
                    {editingRevaluation ? 'Update' : 'Record'} Revaluation
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