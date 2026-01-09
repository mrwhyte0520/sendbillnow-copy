import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { exportToExcelStyled } from '../../../utils/exportImportUtils';
import { bonusesService } from '../../../services/database';

interface Bonus {
  id: string;
  name: string;
  type: 'fijo' | 'porcentaje' | 'formula';
  amount: number;
  percentage?: number;
  formula?: string;
  frequency: 'mensual' | 'trimestral' | 'semestral' | 'anual' | 'unico';
  category: 'productividad' | 'ventas' | 'asistencia' | 'antiguedad' | 'navidad' | 'vacaciones' | 'otro';
  isActive: boolean;
  isTaxable: boolean;
  affectsISR: boolean;
  affectsSocialSecurity: boolean;
  description: string;
  conditions: string;
  createdAt: string;
}

export default function PayrollBonusesPage() {
  const { user } = useAuth();
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('todos');
  const [typeFilter, setTypeFilter] = useState<string>('todos');
  const [showForm, setShowForm] = useState(false);
  const [editingBonus, setEditingBonus] = useState<Bonus | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    type: 'fijo' as Bonus['type'],
    amount: 0,
    percentage: 0,
    formula: '',
    frequency: 'mensual' as Bonus['frequency'],
    category: 'productividad' as Bonus['category'],
    isTaxable: true,
    affectsISR: true,
    affectsSocialSecurity: true,
    description: '',
    conditions: ''
  });

  useEffect(() => {
    const loadBonuses = async () => {
      if (!user) return;
      try {
        const data = await bonusesService.getAll(user.id);
        const mapped: Bonus[] = (data || []).map((b: any) => ({
          id: b.id,
          name: b.name,
          type: b.type,
          amount: Number(b.amount) || 0,
          percentage: b.percentage ?? undefined,
          formula: b.formula || '',
          frequency: b.frequency,
          category: b.category,
          isActive: !!b.is_active,
          isTaxable: !!b.is_taxable,
          affectsISR: !!b.affects_isr,
          affectsSocialSecurity: !!b.affects_social_security,
          description: b.description || '',
          conditions: b.conditions || '',
          createdAt: b.created_at || new Date().toISOString(),
        }));
        setBonuses(mapped);
      } catch (error) {
        console.error('Error loading bonuses:', error);
      }
    };

    loadBonuses();
  }, [user]);

  const filteredBonuses = bonuses.filter(bonus => {
    const matchesSearch = bonus.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         bonus.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'todos' || bonus.category === categoryFilter;
    const matchesType = typeFilter === 'todos' || bonus.type === typeFilter;
    
    return matchesSearch && matchesCategory && matchesType;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const payload: any = {
      name: formData.name,
      type: formData.type,
      amount: formData.type === 'fijo' ? formData.amount : 0,
      percentage: formData.type === 'porcentaje' ? formData.percentage : null,
      formula: formData.type === 'formula' ? formData.formula : null,
      frequency: formData.frequency,
      category: formData.category,
      is_taxable: formData.isTaxable,
      affects_isr: formData.affectsISR,
      affects_social_security: formData.affectsSocialSecurity,
      description: formData.description,
      conditions: formData.conditions,
      is_active: true,
    };

    try {
      if (editingBonus) {
        const updated = await bonusesService.update(editingBonus.id, payload);
        const mapped: Bonus = {
          id: updated.id,
          name: updated.name,
          type: updated.type,
          amount: Number(updated.amount) || 0,
          percentage: updated.percentage ?? undefined,
          formula: updated.formula || '',
          frequency: updated.frequency,
          category: updated.category,
          isActive: !!updated.is_active,
          isTaxable: !!updated.is_taxable,
          affectsISR: !!updated.affects_isr,
          affectsSocialSecurity: !!updated.affects_social_security,
          description: updated.description || '',
          conditions: updated.conditions || '',
          createdAt: updated.created_at || new Date().toISOString(),
        };
        setBonuses(prev => prev.map(bonus => bonus.id === editingBonus.id ? mapped : bonus));
      } else {
        const created = await bonusesService.create(user.id, payload);
        const mapped: Bonus = {
          id: created.id,
          name: created.name,
          type: created.type,
          amount: Number(created.amount) || 0,
          percentage: created.percentage ?? undefined,
          formula: created.formula || '',
          frequency: created.frequency,
          category: created.category,
          isActive: !!created.is_active,
          isTaxable: !!created.is_taxable,
          affectsISR: !!created.affects_isr,
          affectsSocialSecurity: !!created.affects_social_security,
          description: created.description || '',
          conditions: created.conditions || '',
          createdAt: created.created_at || new Date().toISOString(),
        };
        setBonuses(prev => [...prev, mapped]);
      }

      resetForm();
    } catch (error) {
      console.error('Error saving bonus:', error);
      alert('Error saving bonus');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'fijo',
      amount: 0,
      percentage: 0,
      formula: '',
      frequency: 'mensual',
      category: 'productividad',
      isTaxable: true,
      affectsISR: true,
      affectsSocialSecurity: true,
      description: '',
      conditions: ''
    });
    setEditingBonus(null);
    setShowForm(false);
  };

  const handleEdit = (bonus: Bonus) => {
    setFormData({
      name: bonus.name,
      type: bonus.type,
      amount: bonus.amount,
      percentage: bonus.percentage || 0,
      formula: bonus.formula || '',
      frequency: bonus.frequency,
      category: bonus.category,
      isTaxable: bonus.isTaxable,
      affectsISR: bonus.affectsISR,
      affectsSocialSecurity: bonus.affectsSocialSecurity,
      description: bonus.description,
      conditions: bonus.conditions
    });
    setEditingBonus(bonus);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this bonus?')) return;
    try {
      await bonusesService.delete(id);
      setBonuses(bonuses.filter(bonus => bonus.id !== id));
    } catch (error) {
      console.error('Error deleting bonus:', error);
      alert('Error deleting bonus');
    }
  };

  const toggleStatus = async (id: string) => {
    const bonus = bonuses.find(b => b.id === id);
    if (!bonus) return;
    try {
      const payload: any = {
        name: bonus.name,
        type: bonus.type,
        amount: bonus.amount,
        percentage: bonus.percentage ?? null,
        formula: bonus.formula || null,
        frequency: bonus.frequency,
        category: bonus.category,
        is_taxable: bonus.isTaxable,
        affects_isr: bonus.affectsISR,
        affects_social_security: bonus.affectsSocialSecurity,
        description: bonus.description,
        conditions: bonus.conditions,
        is_active: !bonus.isActive,
      };
      const updated = await bonusesService.update(id, payload);
      setBonuses(prev => prev.map(b => b.id === id ? {
        ...b,
        isActive: !!updated.is_active,
      } : b));
    } catch (error) {
      console.error('Error toggling bonus status:', error);
      alert('Error toggling bonus status');
    }
  };

  const exportToCSV = async () => {
    const today = new Date().toISOString().split('T')[0];

    const rows = filteredBonuses.map(bonus => ({
      name: bonus.name,
      type:
        bonus.type === 'fijo' ? 'Fixed Amount' :
        bonus.type === 'porcentaje' ? 'Percentage' : 'Formula',
      value:
        bonus.type === 'fijo' ? `RD$${bonus.amount.toLocaleString()}` :
        bonus.type === 'porcentaje' ? `${bonus.percentage}%` : bonus.formula,
      frequency: getFrequencyLabel(bonus.frequency),
      category: getCategoryLabel(bonus.category),
      taxable: bonus.isTaxable ? 'Yes' : 'No',
      affectsISR: bonus.affectsISR ? 'Yes' : 'No',
      affectsSS: bonus.affectsSocialSecurity ? 'Yes' : 'No',
      status: bonus.isActive ? 'Active' : 'Inactive',
    }));

    if (!rows.length) {
      alert('No bonuses to export.');
      return;
    }

    await exportToExcelStyled(
      rows,
      [
        { key: 'name', title: 'Name', width: 26 },
        { key: 'type', title: 'Type', width: 16 },
        { key: 'value', title: 'Amount/Percentage', width: 20 },
        { key: 'frequency', title: 'Frequency', width: 16 },
        { key: 'category', title: 'Category', width: 18 },
        { key: 'taxable', title: 'Taxable', width: 12 },
        { key: 'affectsISR', title: 'Income Tax', width: 14 },
        { key: 'affectsSS', title: 'Social Security', width: 14 },
        { key: 'status', title: 'Status', width: 12 },
      ],
      `bonuses_${today}`,
      'Bonuses'
    );
  };

  const getCategoryColor = (category: Bonus['category']) => {
    switch (category) {
      case 'productividad': return 'bg-blue-100 text-blue-800';
      case 'ventas': return 'bg-green-100 text-green-800';
      case 'asistencia': return 'bg-purple-100 text-purple-800';
      case 'antiguedad': return 'bg-orange-100 text-orange-800';
      case 'navidad': return 'bg-red-100 text-red-800';
      case 'vacaciones': return 'bg-yellow-100 text-yellow-800';
      case 'otro': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryLabel = (category: Bonus['category']) => {
    switch (category) {
      case 'productividad': return 'Productivity';
      case 'ventas': return 'Sales';
      case 'asistencia': return 'Attendance';
      case 'antiguedad': return 'Tenure';
      case 'navidad': return 'Holiday';
      case 'vacaciones': return 'Vacation';
      case 'otro': return 'Other';
      default: return category;
    }
  };

  const getFrequencyLabel = (frequency: Bonus['frequency']) => {
    switch (frequency) {
      case 'mensual': return 'Monthly';
      case 'trimestral': return 'Quarterly';
      case 'semestral': return 'Semiannual';
      case 'anual': return 'Annual';
      case 'unico': return 'One-time';
      default: return frequency;
    }
  };

  const stats = {
    total: bonuses.length,
    active: bonuses.filter(b => b.isActive).length,
    taxable: bonuses.filter(b => b.isTaxable).length,
    monthly: bonuses.filter(b => b.frequency === 'mensual').length
  };

  return (
    <DashboardLayout>
    <div className="space-y-6 bg-[#f6f3ea] min-h-screen -mx-4 sm:mx-0 p-4 sm:p-0">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bonuses</h1>
          <p className="text-gray-700 mt-1">Manage bonuses and additional payments</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll')}
            className="px-4 py-2 bg-[#e5ead7] text-[#2f3a1f] rounded-lg hover:bg-[#d7dec3] transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <i className="ri-arrow-left-line"></i>
            Back to Payroll
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm"
          >
            <i className="ri-add-line"></i>
            New Bonus
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-[#dfe5cf]">
          <div className="flex items-center">
            <div className="p-2 bg-[#e5ead7] rounded-lg">
              <i className="ri-gift-line text-xl text-[#4b5320]"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Bonuses</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-[#dfe5cf]">
          <div className="flex items-center">
            <div className="p-2 bg-[#dbe8c0] rounded-lg">
              <i className="ri-check-line text-xl text-[#3d451b]"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active</p>
              <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-[#dfe5cf]">
          <div className="flex items-center">
            <div className="p-2 bg-[#f1e4c2] rounded-lg">
              <i className="ri-money-dollar-circle-line text-xl text-[#4b5320]"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Taxable</p>
              <p className="text-2xl font-bold text-gray-900">{stats.taxable}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-[#dfe5cf]">
          <div className="flex items-center">
            <div className="p-2 bg-[#e0e5d0] rounded-lg">
              <i className="ri-calendar-line text-xl text-[#4b5320]"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Monthly</p>
              <p className="text-2xl font-bold text-gray-900">{stats.monthly}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Controles */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-[#dfe5cf] mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-col sm:flex-row gap-4 flex-1">
            <div className="relative">
              <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                placeholder="Search bonuses..."
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <select
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="todos">All categories</option>
              <option value="productividad">Productivity</option>
              <option value="ventas">Sales</option>
              <option value="asistencia">Attendance</option>
              <option value="antiguedad">Tenure</option>
              <option value="navidad">Holiday</option>
              <option value="vacaciones">Vacation</option>
              <option value="otro">Other</option>
            </select>

            <select
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="todos">All types</option>
              <option value="fijo">Fixed Amount</option>
              <option value="porcentaje">Percentage</option>
              <option value="formula">Formula</option>
            </select>
          </div>

          <div className="flex gap-3">
            <button
              onClick={exportToCSV}
              className="px-4 py-2 bg-[#2f3a1f] text-white rounded-lg hover:bg-[#273016] transition-colors whitespace-nowrap shadow-sm"
            >
              <i className="ri-download-line mr-2"></i>
              Export
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors whitespace-nowrap shadow-sm"
            >
              <i className="ri-add-line mr-2"></i>
              New Bonus
            </button>
          </div>
        </div>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingBonus ? 'Edit Bonus' : 'New Bonus'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bonus name *
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Calculation type *
                  </label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as Bonus['type'] })}
                  >
                    <option value="fijo">Fixed Amount</option>
                    <option value="porcentaje">Percentage</option>
                    <option value="formula">Formula</option>
                  </select>
                </div>

                {formData.type === 'fijo' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount (RD$) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                    />
                  </div>
                )}

                {formData.type === 'porcentaje' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Percentage (%) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      max="100"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      value={formData.percentage}
                      onChange={(e) => setFormData({ ...formData, percentage: parseFloat(e.target.value) })}
                    />
                  </div>
                )}

                {formData.type === 'formula' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Formula *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. base_salary * 0.5"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      value={formData.formula}
                      onChange={(e) => setFormData({ ...formData, formula: e.target.value })}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Frequency *
                  </label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value as Bonus['frequency'] })}
                  >
                    <option value="mensual">Monthly</option>
                    <option value="trimestral">Quarterly</option>
                    <option value="semestral">Semiannual</option>
                    <option value="anual">Annual</option>
                    <option value="unico">One-time</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category *
                  </label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as Bonus['category'] })}
                  >
                    <option value="productividad">Productivity</option>
                    <option value="ventas">Sales</option>
                    <option value="asistencia">Attendance</option>
                    <option value="antiguedad">Tenure</option>
                    <option value="navidad">Holiday</option>
                    <option value="vacaciones">Vacation</option>
                    <option value="otro">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Conditions to apply
                </label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                  value={formData.conditions}
                  onChange={(e) => setFormData({ ...formData, conditions: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-[#4b5320] focus:ring-[#4b5320]"
                    checked={formData.isTaxable}
                    onChange={(e) => setFormData({ ...formData, isTaxable: e.target.checked })}
                  />
                  <span className="ml-2 text-sm text-gray-700">Taxable</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-[#4b5320] focus:ring-[#4b5320]"
                    checked={formData.affectsISR}
                    onChange={(e) => setFormData({ ...formData, affectsISR: e.target.checked })}
                  />
                  <span className="ml-2 text-sm text-gray-700">Affects income tax</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-[#4b5320] focus:ring-[#4b5320]"
                    checked={formData.affectsSocialSecurity}
                    onChange={(e) => setFormData({ ...formData, affectsSocialSecurity: e.target.checked })}
                  />
                  <span className="ml-2 text-sm text-gray-700">Affects social security</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors shadow-sm"
                >
                  {editingBonus ? 'Update' : 'Create'} Bonus
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista de Bonificaciones */}
      <div className="bg-white rounded-xl shadow-sm border border-[#dfe5cf] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bonus
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type/Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Frequency
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Taxes
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredBonuses.map((bonus) => (
                <tr key={bonus.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{bonus.name}</div>
                      <div className="text-sm text-gray-500">{bonus.description}</div>
                      {bonus.conditions && (
                        <div className="text-xs text-gray-400 mt-1">
                          <i className="ri-information-line mr-1"></i>
                          {bonus.conditions}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {bonus.type === 'fijo' && `RD$${bonus.amount.toLocaleString()}`}
                      {bonus.type === 'porcentaje' && `${bonus.percentage}%`}
                      {bonus.type === 'formula' && bonus.formula}
                    </div>
                    <div className="text-xs text-gray-500 capitalize">
                      {bonus.type === 'fijo' && 'Fixed amount'}
                      {bonus.type === 'porcentaje' && 'Percentage'}
                      {bonus.type === 'formula' && 'Formula'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{getFrequencyLabel(bonus.frequency)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(bonus.category)}`}>
                      {getCategoryLabel(bonus.category)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      {bonus.isTaxable && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[#dbe8c0] text-[#2f3a1f]">
                          Taxable
                        </span>
                      )}
                      {bonus.affectsISR && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[#f1e4c2] text-[#3d451b]">
                          Income Tax
                        </span>
                      )}
                      {bonus.affectsSocialSecurity && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[#e5ead7] text-[#2f3a1f]">
                          Social Security
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      bonus.isActive 
                        ? 'bg-[#dbe8c0] text-[#2f3a1f]' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {bonus.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(bonus)}
                        className="text-[#4b5320] hover:text-[#2f3a1f]"
                        title="Edit"
                      >
                        <i className="ri-edit-line"></i>
                      </button>
                      <button
                        onClick={() => toggleStatus(bonus.id)}
                        className={`${bonus.isActive ? 'text-red-600 hover:text-red-900' : 'text-[#4b5320] hover:text-[#2f3a1f]'}`}
                        title={bonus.isActive ? 'Deactivate' : 'Activate'}
                      >
                        <i className={`${bonus.isActive ? 'ri-pause-circle-line' : 'ri-play-circle-line'}`}></i>
                      </button>
                      <button
                        onClick={() => handleDelete(bonus.id)}
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

        {filteredBonuses.length === 0 && (
          <div className="text-center py-12">
            <i className="ri-gift-line text-4xl text-gray-400 mb-4"></i>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No bonuses</h3>
            <p className="text-gray-500 mb-4">No bonuses found with the current filters.</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors shadow-sm"
            >
              Create first bonus
            </button>
          </div>
        )}
      </div>
    </div>
    </DashboardLayout>
  );
}
