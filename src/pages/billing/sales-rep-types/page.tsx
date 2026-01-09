import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { salesRepTypesService } from '../../../services/database';

const BASE_CARD_CLASSES =
  'bg-[#FBF7EF] border border-[#D9C8A9] rounded-2xl shadow-[0_18px_38px_rgba(55,74,58,0.12)]';
const TABLE_HEADER_CLASSES =
  'px-6 py-3 text-left text-xs font-semibold tracking-[0.08em] uppercase text-[#7A705A]';
const TABLE_CELL_CLASSES = 'px-6 py-4 whitespace-nowrap text-sm text-[#2F3D2E]';
const INPUT_CLASSES =
  'w-full px-3 py-2 border border-[#D9C8A9] rounded-lg text-sm text-[#2F3D2E] bg-white focus:ring-2 focus:ring-[#3C4F3C] focus:border-[#3C4F3C] transition';
const PRIMARY_BUTTON_CLASSES =
  'px-4 py-2 bg-[#3C4F3C] text-white rounded-lg hover:bg-[#2D3B2E] transition font-semibold flex items-center gap-2 shadow-[0_10px_25px_rgba(60,79,60,0.35)]';
const SECONDARY_BUTTON_CLASSES =
  'px-4 py-2 bg-[#EBDAC0] text-[#2F3D2E] rounded-lg hover:bg-[#DEC6A0] transition font-semibold flex items-center gap-2';

interface SalesRepType {
  id: string;
  name: string;
  description: string | null;
  default_commission_rate: number | null;
  max_discount_percent: number | null;
  is_active: boolean;
}

export default function SalesRepTypesPage() {
  const { user } = useAuth();
  const [types, setTypes] = useState<SalesRepType[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState<SalesRepType | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    default_commission_rate: '',
    max_discount_percent: '',
  });

  const loadTypes = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await salesRepTypesService.getAll(user.id);
      setTypes(data as SalesRepType[]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading sales rep types:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadTypes();
    }
  }, [user?.id]);

  const resetForm = () => {
    setForm({ name: '', description: '', default_commission_rate: '', max_discount_percent: '' });
    setEditingType(null);
  };

  const openNewModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (t: SalesRepType) => {
    setEditingType(t);
    setForm({
      name: t.name,
      description: t.description || '',
      default_commission_rate: t.default_commission_rate != null ? String(t.default_commission_rate) : '',
      max_discount_percent: t.max_discount_percent != null ? String(t.max_discount_percent) : '',
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    if (!form.name.trim()) {
      alert('Sales rep type name is required');
      return;
    }

    const defaultCommission = form.default_commission_rate ? Number(form.default_commission_rate) : null;
    const maxDiscount = form.max_discount_percent ? Number(form.max_discount_percent) : null;

    try {
      if (editingType) {
        await salesRepTypesService.update(editingType.id, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          default_commission_rate: defaultCommission,
          max_discount_percent: maxDiscount,
        });
      } else {
        await salesRepTypesService.create(user.id, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          default_commission_rate: defaultCommission ?? undefined,
          max_discount_percent: maxDiscount ?? undefined,
        });
      }

      await loadTypes();
      setShowModal(false);
      resetForm();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error saving sales rep type:', error);
      alert('Error saving sales rep type');
    }
  };

  const handleToggleActive = async (t: SalesRepType) => {
    try {
      await salesRepTypesService.update(t.id, { is_active: !t.is_active });
      await loadTypes();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error updating sales rep type status:', error);
      alert('Error updating sales rep type status');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 bg-[#F4ECDC] min-h-screen rounded-[32px] p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex text-xs font-semibold tracking-[0.2em] uppercase text-[#7A705A]">
              People
            </span>
            <h1 className="text-3xl font-semibold text-[#2F3D2E] mt-1">Sales Rep Types</h1>
            <p className="text-[#5F6652] max-w-2xl">
              Classify your team and standardize commission and discount rules per profile.
            </p>
          </div>
          <button onClick={openNewModal} className={PRIMARY_BUTTON_CLASSES}>
            <i className="ri-add-line" />
            <span>New Type</span>
          </button>
        </div>

        {/* Table */}
        <div className={`${BASE_CARD_CLASSES} overflow-hidden`}>
          <div className="px-6 py-5 border-b border-[#D9C8A9] bg-[#FFF9EE]">
            <h3 className="text-lg font-semibold text-[#2F3D2E]">Sales Rep Type Library</h3>
            <p className="text-sm text-[#7A705A]">
              Suggested commission and maximum discount per commercial profile.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8F1E3]">
                <tr>
                  <th className={TABLE_HEADER_CLASSES}>Name</th>
                  <th className={TABLE_HEADER_CLASSES}>Description</th>
                  <th className={TABLE_HEADER_CLASSES}>Default Commission (%)</th>
                  <th className={TABLE_HEADER_CLASSES}>Suggested Max Discount (%)</th>
                  <th className={TABLE_HEADER_CLASSES}>Status</th>
                  <th className={TABLE_HEADER_CLASSES}>Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#EADDC4]">
                {types.map((t) => (
                  <tr key={t.id} className="hover:bg-[#FFF7E8] transition">
                    <td className={TABLE_CELL_CLASSES}>{t.name}</td>
                    <td className={`${TABLE_CELL_CLASSES} max-w-xs truncate`}>
                      {t.description || '-'}
                    </td>
                    <td className={TABLE_CELL_CLASSES}>
                      {t.default_commission_rate != null ? `${t.default_commission_rate}%` : '-'}
                    </td>
                    <td className={TABLE_CELL_CLASSES}>
                      {t.max_discount_percent != null ? `${t.max_discount_percent}%` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                          t.is_active
                            ? 'bg-[#DDE7D0] text-[#2F3D2E]'
                            : 'bg-[#E5E2D9] text-[#7A705A]'
                        }`}
                      >
                        {t.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditModal(t)}
                          className="p-2 rounded-lg bg-white border border-[#EADDC4] text-[#3C4F3C] hover:bg-[#F8F1E3]"
                          title="Edit"
                        >
                          <i className="ri-edit-line" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(t)}
                          className="p-2 rounded-lg bg-white border border-[#EADDC4] text-[#7A705A] hover:bg-[#F8F1E3]"
                          title={t.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <i className={t.is_active ? 'ri-toggle-line' : 'ri-toggle-fill'} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && types.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-sm text-center text-[#7A705A]">
                      No sales rep types have been configured yet.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-sm text-center text-[#7A705A]">
                      Loading types...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className={`${BASE_CARD_CLASSES} w-full max-w-xl p-6`}>
              <div className="flex items-center justify-between border-b border-[#D9C8A9] pb-4 mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-[#2F3D2E]">
                    {editingType ? 'Edit Sales Rep Type' : 'New Sales Rep Type'}
                  </h3>
                  <p className="text-sm text-[#7A705A]">
                    Define commission defaults and discount guardrails.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="text-[#7A705A] hover:text-[#3C4F3C]"
                >
                  <i className="ri-close-line text-xl" />
                </button>
              </div>
              <form onSubmit={handleSave} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-[#5F6652] mb-1">
                    Name <span className="text-[#B9583C]">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={INPUT_CLASSES}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#5F6652] mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className={`${INPUT_CLASSES} resize-none`}
                    placeholder="Optional description for this sales rep type"
                  ></textarea>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#5F6652] mb-1">
                      Default Commission (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={form.default_commission_rate}
                      onChange={(e) => setForm({ ...form, default_commission_rate: e.target.value })}
                      className={INPUT_CLASSES}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#5F6652] mb-1">
                      Suggested Max Discount (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={form.max_discount_percent}
                      onChange={(e) => setForm({ ...form, max_discount_percent: e.target.value })}
                      className={INPUT_CLASSES}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-[#D9C8A9]">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                    className={SECONDARY_BUTTON_CLASSES}
                  >
                    Cancel
                  </button>
                  <button type="submit" className={PRIMARY_BUTTON_CLASSES}>
                    Save
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
