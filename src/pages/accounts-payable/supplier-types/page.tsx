import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { supplierTypesService } from '../../../services/database';

const palette = {
  cream: '#F6F1E7',
  green: '#2F4F30',
  greenDark: '#1F2B1A',
  greenMid: '#4B5E2F',
  greenSoft: '#7E8F63',
  badgeNeutral: '#E5DCC3',
};

const translateSupplierTypeName = (value: string) => {
  const normalized = String(value || '').toLowerCase();
  switch (normalized) {
    case 'persona física':
    case 'persona fisica':
      return 'Individual';
    case 'persona jurídica':
    case 'persona juridica':
      return 'Corporate';
    case 'prestador de servicios':
      return 'Service Provider';
    case 'proveedor informal':
      return 'Informal Supplier';
    case 'sin especificar':
      return 'Unspecified';
    default:
      return value || 'Supplier';
  }
};

export default function SupplierTypesPage() {
  const { user } = useAuth();
  const [types, setTypes] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState<any>(null);
  const normalizeName = (value: any) => String(value || '').trim().toLowerCase();
  const isPersonaFisicaType = (name: any) => {
    const n = normalizeName(name);
    return n === 'persona física' || n === 'persona fisica';
  };

  const isrWithholdingRateOptions = [
    0, 1, 2, 5, 8, 10, 15, 18, 20, 25, 27, 29, 30, 35, 40, 50, 60, 75, 100,
  ];

  const itbisWithholdingRateOptions = [0, 30, 100];

  const getDefaultItbisWithholdingRate = (name: any) => {
    const n = normalizeName(name);
    if (n === 'prestador de servicios') return 30;
    if (n === 'persona física' || n === 'persona fisica') return 30;
    if (n === 'proveedor informal') return 100;
    return 0;
  };

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    affects_itbis: true,
    affects_isr: true,
    is_rst: false,
    is_ong: false,
    is_non_taxpayer: false,
    is_government: false,
    default_invoice_type: '',
    tax_regime: '',
    isr_withholding_rate: null as number | null,
    itbis_withholding_rate: null as number | null,
  });

  const loadTypes = async () => {
    if (!user?.id) {
      setTypes([]);
      return;
    }
    try {
      const rows = await supplierTypesService.getAll(user.id);
      setTypes(rows || []);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading supplier types', error);
      setTypes([]);
    }
  };

  useEffect(() => {
    loadTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      affects_itbis: true,
      affects_isr: true,
      is_rst: false,
      is_ong: false,
      is_non_taxpayer: false,
      is_government: false,
      default_invoice_type: '',
      tax_regime: '',
      isr_withholding_rate: null,
      itbis_withholding_rate: null,
    });
    setEditingType(null);
    setShowModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      alert('You must sign in to manage supplier types.');
      return;
    }

    const resolvedItbisWithholdingRate =
      formData.itbis_withholding_rate == null
        ? getDefaultItbisWithholdingRate(formData.name)
        : Number(formData.itbis_withholding_rate);

    const safeItbisWithholdingRate = [0, 30, 100].includes(resolvedItbisWithholdingRate)
      ? resolvedItbisWithholdingRate
      : 0;

    const payload = {
      ...formData,
      isr_withholding_rate: isPersonaFisicaType(formData.name) ? formData.isr_withholding_rate : null,
      itbis_withholding_rate: safeItbisWithholdingRate,
    };

    try {
      if (editingType?.id) {
        await supplierTypesService.update(editingType.id, payload);
      } else {
        await supplierTypesService.create(user.id, payload);
      }
      await loadTypes();
      resetForm();
      alert(editingType ? 'Supplier type updated successfully.' : 'Supplier type created successfully.');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error saving supplier type', error);
      alert('The supplier type could not be saved.');
    }
  };

  const handleEdit = (row: any) => {
    setEditingType(row);
    const defaultItbis = getDefaultItbisWithholdingRate(row?.name);
    setFormData({
      name: row.name || '',
      description: row.description || '',
      affects_itbis: row.affects_itbis !== false,
      affects_isr: row.affects_isr !== false,
      is_rst: !!row.is_rst,
      is_ong: !!row.is_ong,
      is_non_taxpayer: !!row.is_non_taxpayer,
      is_government: !!row.is_government,
      default_invoice_type: row.default_invoice_type || '',
      tax_regime: row.tax_regime || '',
      isr_withholding_rate: typeof row.isr_withholding_rate === 'number' ? row.isr_withholding_rate : null,
      itbis_withholding_rate: typeof row.itbis_withholding_rate === 'number' ? row.itbis_withholding_rate : defaultItbis,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!user?.id) {
      alert('You must sign in to delete supplier types.');
      return;
    }
    if (!confirm('Delete this supplier type?')) return;

    try {
      await supplierTypesService.delete(id);
      await loadTypes();
      alert('Supplier type deleted.');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error deleting supplier type', error);
      alert('The supplier type could not be removed.');
    }
  };

  return (
    <DashboardLayout>
      <div
        className="space-y-6 rounded-3xl"
        style={{ backgroundColor: palette.cream, minHeight: '100vh', padding: '24px' }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide font-semibold" style={{ color: palette.greenSoft }}>
              Purchasing · Tax Profiles
            </p>
            <h1 className="text-3xl font-bold" style={{ color: palette.greenDark }}>Supplier Types</h1>
            <p className="text-base" style={{ color: palette.greenSoft }}>
              Catalog of supplier profiles for fiscal and accounting setup
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 rounded-lg font-semibold text-white transition-colors whitespace-nowrap shadow"
            style={{ backgroundColor: palette.green }}
          >
            <i className="ri-add-line mr-2" />
            New Type
          </button>
        </div>

        <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0]">
          <div className="p-6 border-b border-[#e8e0d0] bg-gradient-to-r from-[#f8f6f0] to-[#f0ece0] rounded-t-2xl">
            <h3 className="text-lg font-semibold" style={{ color: palette.greenDark }}>Supplier Type List</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-[#f8f6f0] to-[#f0ece0]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Configuration</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {types.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {translateSupplierTypeName(t.name)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 max-w-md truncate">{t.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div className="flex flex-wrap gap-1">
                        {t.affects_itbis && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-800">Affects VAT</span>
                        )}
                        {t.affects_isr && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800">Affects Income Tax</span>
                        )}
                        {t.is_rst && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700">RST</span>
                        )}
                        {t.is_ong && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-purple-50 text-purple-700">ONG</span>
                        )}
                        {t.is_non_taxpayer && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800">Non-taxpayer</span>
                        )}
                        {t.is_government && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">Government</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(t)}
                          className="text-indigo-600 hover:text-indigo-900 whitespace-nowrap"
                        >
                          <i className="ri-edit-line" />
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="text-red-600 hover:text-red-900 whitespace-nowrap"
                        >
                          <i className="ri-delete-bin-line" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {types.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                      No supplier types yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingType ? 'Edit Supplier Type' : 'New Supplier Type'}
                </h3>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => {
                      const nextName = e.target.value;
                      setFormData((prev) => ({
                        ...prev,
                        name: nextName,
                        isr_withholding_rate: isPersonaFisicaType(nextName) ? prev.isr_withholding_rate : null,
                        itbis_withholding_rate:
                          prev.itbis_withholding_rate == null ? getDefaultItbisWithholdingRate(nextName) : prev.itbis_withholding_rate,
                      }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">ISR Withholding (Individuals)</label>
                  <select
                    value={formData.isr_withholding_rate == null ? '' : String(formData.isr_withholding_rate)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setFormData({
                        ...formData,
                        isr_withholding_rate: raw === '' ? null : Number(raw),
                      });
                    }}
                    disabled={!isPersonaFisicaType(formData.name)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                  >
                    <option value="">Not specified</option>
                    {isrWithholdingRateOptions.map((rate) => (
                      <option key={rate} value={rate}>{rate} %</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Applied automatically for supplier types classified as Individuals.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">VAT Withholding</label>
                  <select
                    value={formData.itbis_withholding_rate == null ? '' : String(formData.itbis_withholding_rate)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setFormData({
                        ...formData,
                        itbis_withholding_rate: raw === '' ? null : Number(raw),
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Not specified</option>
                    {itbisWithholdingRateOptions.map((rate) => (
                      <option key={rate} value={rate}>{rate} %</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="inline-flex items-center text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.affects_itbis}
                      onChange={(e) => setFormData({ ...formData, affects_itbis: e.target.checked })}
                      className="mr-2"
                    />
                    Affects VAT
                  </label>
                  <label className="inline-flex items-center text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.affects_isr}
                      onChange={(e) => setFormData({ ...formData, affects_isr: e.target.checked })}
                      className="mr-2"
                    />
                    Affects Income Tax
                  </label>
                  <label className="inline-flex items-center text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.is_rst}
                      onChange={(e) => setFormData({ ...formData, is_rst: e.target.checked })}
                      className="mr-2"
                    />
                    RST Regime
                  </label>
                  <label className="inline-flex items-center text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.is_ong}
                      onChange={(e) => setFormData({ ...formData, is_ong: e.target.checked })}
                      className="mr-2"
                    />
                    NGO / Foundation
                  </label>
                  <label className="inline-flex items-center text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.is_non_taxpayer}
                      onChange={(e) => setFormData({ ...formData, is_non_taxpayer: e.target.checked })}
                      className="mr-2"
                    />
                    Non-taxpayer
                  </label>
                  <label className="inline-flex items-center text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.is_government}
                      onChange={(e) => setFormData({ ...formData, is_government: e.target.checked })}
                      className="mr-2"
                    />
                    Government / Public Entity
                  </label>
                </div>

                {formData.is_government && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Default Invoice Type</label>
                      <select
                        value={formData.default_invoice_type}
                        onChange={(e) => setFormData({ ...formData, default_invoice_type: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select type</option>
                        <option value="01">01 - Fiscal Credit Invoice</option>
                        <option value="02">02 - Consumer Invoice</option>
                        <option value="03">03 - Debit Note</option>
                        <option value="04">04 - Credit Note</option>
                        <option value="11">11 - Purchase Receipt</option>
                        <option value="12">12 - Unique Income Record</option>
                        <option value="13">13 - Minor Expenses</option>
                        <option value="14">14 - Special Regimes</option>
                        <option value="15">15 - Government Receipt</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Tax Regime</label>
                      <select
                        value={formData.tax_regime}
                        onChange={(e) => setFormData({ ...formData, tax_regime: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select regime</option>
                        <option value="ordinario">Ordinary</option>
                        <option value="simplificado">Simplified (RST)</option>
                        <option value="exento">Exempt</option>
                        <option value="especial">Special Regime</option>
                      </select>
                    </div>
                  </div>
                )}
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg text-white whitespace-nowrap shadow"
                    style={{ backgroundColor: palette.greenMid }}
                  >
                    {editingType ? 'Update Type' : 'Create Type'}
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
