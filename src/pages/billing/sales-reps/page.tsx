import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { salesRepsService, salesRepTypesService } from '../../../services/database';

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

interface SalesRep {
  id: string;
  name: string;
  code: string | null;
  email: string | null;
  phone: string | null;
  commission_rate: number | null;
  is_active: boolean;
}

interface SalesRepType {
  id: string;
  name: string;
  description: string | null;
  default_commission_rate: number | null;
  max_discount_percent: number | null;
  is_active: boolean;
}

export default function SalesRepsPage() {
  const { user } = useAuth();
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [repTypes, setRepTypes] = useState<SalesRepType[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRep, setEditingRep] = useState<SalesRep | null>(null);
  const [form, setForm] = useState({
    name: '',
    code: '',
    email: '',
    phone: '',
    commission_rate: '',
    sales_rep_type_id: '',
  });

  const loadReps = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [repsData, typesData] = await Promise.all([
        salesRepsService.getAll(user.id),
        salesRepTypesService.getAll(user.id),
      ]);
      setReps(repsData as SalesRep[]);
      setRepTypes((typesData as SalesRepType[]).filter(t => t.is_active));
    } catch (error) {
      console.error('Error loading sales reps:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadReps();
    }
  }, [user?.id]);

  const resetForm = () => {
    setForm({ name: '', code: '', email: '', phone: '', commission_rate: '', sales_rep_type_id: '' });
    setEditingRep(null);
  };

  const openNewModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (rep: SalesRep) => {
    setEditingRep(rep);
    const typeId = (rep as any).sales_rep_type_id || '';
    const selectedType = repTypes.find(t => t.id === typeId);
    setForm({
      name: rep.name,
      code: rep.code || '',
      email: rep.email || '',
      phone: rep.phone || '',
      commission_rate: selectedType?.default_commission_rate != null 
        ? String(selectedType.default_commission_rate) 
        : '',
      sales_rep_type_id: typeId,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    if (!form.name.trim()) {
      alert('El nombre del vendedor es obligatorio');
      return;
    }

    const commission = form.commission_rate ? Number(form.commission_rate) : null;

    try {
      if (editingRep) {
        await salesRepsService.update(editingRep.id, {
          name: form.name.trim(),
          code: form.code.trim() || undefined,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          commission_rate: commission,
          sales_rep_type_id: form.sales_rep_type_id || undefined,
        });
      } else {
        await salesRepsService.create(user.id, {
          name: form.name.trim(),
          code: form.code.trim() || undefined,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          commission_rate: commission ?? undefined,
          sales_rep_type_id: form.sales_rep_type_id || undefined,
        });
      }

      await loadReps();
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error('Error saving sales rep:', error);
      alert('Error al guardar el vendedor');
    }
  };

  const handleToggleActive = async (rep: SalesRep) => {
    try {
      await salesRepsService.update(rep.id, { is_active: !rep.is_active });
      await loadReps();
    } catch (error) {
      console.error('Error updating sales rep status:', error);
      alert('Error al actualizar el estado del vendedor');
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
            <h1 className="text-3xl font-semibold text-[#2F3D2E] mt-1">Sales Representatives</h1>
            <p className="text-[#5F6652] max-w-2xl">
              Manage your field team, commission rules, and contact info in a single place.
            </p>
          </div>
          <button onClick={openNewModal} className={PRIMARY_BUTTON_CLASSES}>
            <i className="ri-add-line" />
            <span>New Sales Rep</span>
          </button>
        </div>

        {/* Table */}
        <div className={`${BASE_CARD_CLASSES} overflow-hidden`}>
          <div className="px-6 py-5 border-b border-[#D9C8A9] bg-[#FFF9EE] flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-[#2F3D2E]">Sales Rep Directory</h3>
              <p className="text-sm text-[#7A705A]">Track codes, commission tiers, and availability.</p>
            </div>
            {loading && (
              <span className="text-xs text-[#7A705A] flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-[#3C4F3C] border-t-transparent animate-spin" />
                Loading reps...
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8F1E3]">
                <tr>
                  <th className={TABLE_HEADER_CLASSES}>Name</th>
                  <th className={TABLE_HEADER_CLASSES}>Code</th>
                  <th className={TABLE_HEADER_CLASSES}>Email</th>
                  <th className={TABLE_HEADER_CLASSES}>Phone</th>
                  <th className={TABLE_HEADER_CLASSES}>Type</th>
                  <th className={TABLE_HEADER_CLASSES}>Commission (%)</th>
                  <th className={TABLE_HEADER_CLASSES}>Status</th>
                  <th className={TABLE_HEADER_CLASSES}>Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#EADDC4]">
                {reps.map((rep) => (
                  <tr key={rep.id} className="hover:bg-[#FFF7E8] transition">
                    <td className={TABLE_CELL_CLASSES}>{rep.name}</td>
                    <td className={TABLE_CELL_CLASSES}>{rep.code || '-'}</td>
                    <td className={TABLE_CELL_CLASSES}>{rep.email || '-'}</td>
                    <td className={TABLE_CELL_CLASSES}>{rep.phone || '-'}</td>
                    <td className={TABLE_CELL_CLASSES}>
                      {(() => {
                        const t = repTypes.find((rt) => rt.id === (rep as any).sales_rep_type_id);
                        return t ? t.name : '-';
                      })()}
                    </td>
                    <td className={TABLE_CELL_CLASSES}>
                      {rep.commission_rate != null ? `${rep.commission_rate}%` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                          rep.is_active
                            ? 'bg-[#DDE7D0] text-[#2F3D2E]'
                            : 'bg-[#E5E2D9] text-[#7A705A]'
                        }`}
                      >
                        {rep.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditModal(rep)}
                          className="p-2 rounded-lg bg-white border border-[#EADDC4] text-[#3C4F3C] hover:bg-[#F8F1E3]"
                          title="Edit"
                        >
                          <i className="ri-edit-line" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(rep)}
                          className="p-2 rounded-lg bg-white border border-[#EADDC4] text-[#7A705A] hover:bg-[#F8F1E3]"
                          title={rep.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <i className={rep.is_active ? 'ri-toggle-line' : 'ri-toggle-fill'} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && reps.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-6 text-sm text-center text-[#7A705A]">
                      No sales reps have been added yet.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-6 py-6 text-sm text-center text-[#7A705A]">
                      Loading reps...
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
                    {editingRep ? 'Edit Sales Rep' : 'New Sales Rep'}
                  </h3>
                  <p className="text-sm text-[#7A705A]">
                    Assign codes, contact info, and commission tier.
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#5F6652] mb-1">Code</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form.code}
                        onChange={(e) => setForm({ ...form, code: e.target.value })}
                        className={INPUT_CLASSES}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const prefix = form.name
                            ? form.name.substring(0, 3).toUpperCase().replace(/\s/g, '')
                            : 'REP';
                          const randomNum = Math.floor(Math.random() * 9000) + 1000;
                          const code = `${prefix}-${randomNum}`;
                          setForm({ ...form, code });
                        }}
                        className="px-3 py-2 rounded-lg border border-[#D9C8A9] text-[#2F3D2E] bg-white hover:bg-[#F8F1E3]"
                        title="Generate automatic code"
                      >
                        <i className="ri-refresh-line" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#5F6652] mb-1">Commission (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={form.commission_rate}
                      readOnly
                      disabled
                      className="w-full px-3 py-2 border border-[#D9C8A9] rounded-lg bg-[#F0E4CF] text-[#7A705A] text-sm cursor-not-allowed"
                      title="Commission is pulled from the selected sales rep type"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#5F6652] mb-1">Sales Rep Type</label>
                  <select
                    value={form.sales_rep_type_id}
                    onChange={(e) => {
                      const typeId = e.target.value;
                      const selectedType = repTypes.find((t) => t.id === typeId);
                      setForm({
                        ...form,
                        sales_rep_type_id: typeId,
                        commission_rate:
                          selectedType?.default_commission_rate != null
                            ? String(selectedType.default_commission_rate)
                            : '',
                      });
                    }}
                    className={`${INPUT_CLASSES} pr-8`}
                  >
                    <option value="">No type assigned</option>
                    {repTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#5F6652] mb-1">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={INPUT_CLASSES}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#5F6652] mb-1">Phone</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
