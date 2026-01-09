import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { storesService } from '../../../services/database';

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

interface Store {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  manager_name: string | null;
  is_active: boolean;
}

export default function StoresPage() {
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [form, setForm] = useState({
    name: '',
    code: '',
    address: '',
    city: '',
    phone: '',
    email: '',
    manager_name: '',
  });

  const loadStores = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await storesService.getAll(user.id);
      setStores(data as Store[]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading stores:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadStores();
    }
  }, [user?.id]);

  const resetForm = () => {
    setForm({ name: '', code: '', address: '', city: '', phone: '', email: '', manager_name: '' });
    setEditingStore(null);
  };

  const openNewModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (store: Store) => {
    setEditingStore(store);
    setForm({
      name: store.name,
      code: store.code || '',
      address: store.address || '',
      city: store.city || '',
      phone: store.phone || '',
      email: store.email || '',
      manager_name: store.manager_name || '',
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    if (!form.name.trim()) {
      alert('Store name is required');
      return;
    }

    try {
      if (editingStore) {
        await storesService.update(editingStore.id, {
          name: form.name.trim(),
          code: form.code.trim() || undefined,
          address: form.address.trim() || undefined,
          city: form.city.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          manager_name: form.manager_name.trim() || undefined,
        });
      } else {
        await storesService.create(user.id, {
          name: form.name.trim(),
          code: form.code.trim() || undefined,
          address: form.address.trim() || undefined,
          city: form.city.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          manager_name: form.manager_name.trim() || undefined,
        });
      }

      await loadStores();
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error('Error saving store:', error);
      alert('Error saving store');
    }
  };

  const handleToggleActive = async (store: Store) => {
    try {
      await storesService.update(store.id, { is_active: !store.is_active });
      await loadStores();
    } catch (error) {
      console.error('Error updating store status:', error);
      alert('Error updating store status');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 bg-[#F4ECDC] min-h-screen rounded-[32px] p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex text-xs font-semibold tracking-[0.2em] uppercase text-[#7A705A]">
              Operations
            </span>
            <h1 className="text-3xl font-semibold text-[#2F3D2E] mt-1">Stores & Branches</h1>
            <p className="text-[#5F6652] max-w-2xl">
              Manage locations, key contacts, and communication channels for every store.
            </p>
          </div>
          <button onClick={openNewModal} className={PRIMARY_BUTTON_CLASSES}>
            <i className="ri-add-line" />
            <span>New Store</span>
          </button>
        </div>

        {/* Table */}
        <div className={`${BASE_CARD_CLASSES} overflow-hidden`}>
          <div className="px-6 py-5 border-b border-[#D9C8A9] bg-[#FFF9EE]">
            <h3 className="text-lg font-semibold text-[#2F3D2E]">Store Directory</h3>
            <p className="text-sm text-[#7A705A]">
              Codes, managers, and contact data for each physical location.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8F1E3]">
                <tr>
                  <th className={TABLE_HEADER_CLASSES}>Name</th>
                  <th className={TABLE_HEADER_CLASSES}>Code</th>
                  <th className={TABLE_HEADER_CLASSES}>City</th>
                  <th className={TABLE_HEADER_CLASSES}>Phone</th>
                  <th className={TABLE_HEADER_CLASSES}>Manager</th>
                  <th className={TABLE_HEADER_CLASSES}>Status</th>
                  <th className={TABLE_HEADER_CLASSES}>Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#EADDC4]">
                {stores.map((store) => (
                  <tr key={store.id} className="hover:bg-[#FFF7E8] transition">
                    <td className={TABLE_CELL_CLASSES}>{store.name}</td>
                    <td className={TABLE_CELL_CLASSES}>{store.code || '-'}</td>
                    <td className={TABLE_CELL_CLASSES}>{store.city || '-'}</td>
                    <td className={TABLE_CELL_CLASSES}>{store.phone || '-'}</td>
                    <td className={TABLE_CELL_CLASSES}>{store.manager_name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                          store.is_active
                            ? 'bg-[#DDE7D0] text-[#2F3D2E]'
                            : 'bg-[#E5E2D9] text-[#7A705A]'
                        }`}
                      >
                        {store.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditModal(store)}
                          className="p-2 rounded-lg bg-white border border-[#EADDC4] text-[#3C4F3C] hover:bg-[#F8F1E3]"
                          title="Edit"
                        >
                          <i className="ri-edit-line" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(store)}
                          className="p-2 rounded-lg bg-white border border-[#EADDC4] text-[#7A705A] hover:bg-[#F8F1E3]"
                          title={store.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <i className={store.is_active ? 'ri-toggle-line' : 'ri-toggle-fill'} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && stores.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-6 text-sm text-center text-[#7A705A]">
                      No stores have been added yet.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-6 py-6 text-sm text-center text-[#7A705A]">
                      Loading stores...
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
            <div className={`${BASE_CARD_CLASSES} w-full max-w-2xl p-6`}>
              <div className="flex items-center justify-between border-b border-[#D9C8A9] pb-4 mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-[#2F3D2E]">
                    {editingStore ? 'Edit Store' : 'New Store'}
                  </h3>
                  <p className="text-sm text-[#7A705A]">
                    Capture contact info and internal references for the location.
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <label className="block text-sm font-medium text-[#5F6652] mb-1">Code</label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      className={INPUT_CLASSES}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#5F6652] mb-1">Address</label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      className={INPUT_CLASSES}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#5F6652] mb-1">City</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      className={INPUT_CLASSES}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#5F6652] mb-1">Phone</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className={INPUT_CLASSES}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#5F6652] mb-1">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={INPUT_CLASSES}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#5F6652] mb-1">Manager</label>
                  <input
                    type="text"
                    value={form.manager_name}
                    onChange={(e) => setForm({ ...form, manager_name: e.target.value })}
                    className={INPUT_CLASSES}
                  />
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
