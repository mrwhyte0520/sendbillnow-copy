import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { salesRepsService, salesRepTypesService } from '../../../services/database';

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
          code: form.code.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          commission_rate: commission,
          sales_rep_type_id: form.sales_rep_type_id || null,
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vendedores</h1>
            <p className="text-gray-600">Gestión de vendedores y representantes de ventas</p>
          </div>
          <button
            onClick={openNewModal}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2" />
            Nuevo Vendedor
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Listado de Vendedores</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teléfono</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comisión (%)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reps.map(rep => (
                  <tr key={rep.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{rep.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{rep.code || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{rep.email || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{rep.phone || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(() => {
                        const t = repTypes.find(rt => rt.id === (rep as any).sales_rep_type_id);
                        return t ? t.name : '-';
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {rep.commission_rate != null ? `${rep.commission_rate}%` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          rep.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {rep.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => openEditModal(rep)}
                          className="text-blue-600 hover:text-blue-900 p-1"
                          title="Editar"
                        >
                          <i className="ri-edit-line" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(rep)}
                          className="text-gray-600 hover:text-gray-900 p-1"
                          title={rep.is_active ? 'Desactivar' : 'Activar'}
                        >
                          <i className={rep.is_active ? 'ri-toggle-line' : 'ri-toggle-fill'} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && reps.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-sm text-gray-500 text-center">
                      No hay vendedores registrados.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-sm text-gray-500 text-center">
                      Cargando vendedores...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingRep ? 'Editar Vendedor' : 'Nuevo Vendedor'}
                </h3>
                <button
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl" />
                </button>
              </div>
              <form onSubmit={handleSave} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form.code}
                        onChange={e => setForm({ ...form, code: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const prefix = form.name 
                            ? form.name.substring(0, 3).toUpperCase().replace(/\s/g, '') 
                            : 'VEN';
                          const randomNum = Math.floor(Math.random() * 9000) + 1000;
                          const code = `${prefix}-${randomNum}`;
                          setForm({ ...form, code });
                        }}
                        className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm whitespace-nowrap"
                        title="Generar código automático"
                      >
                        <i className="ri-refresh-line" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Comisión (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={form.commission_rate}
                      readOnly
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 text-sm cursor-not-allowed"
                      title="La comisión se asigna automáticamente según el tipo de vendedor"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de vendedor</label>
                  <select
                    value={form.sales_rep_type_id}
                    onChange={e => {
                      const typeId = e.target.value;
                      const selectedType = repTypes.find(t => t.id === typeId);
                      setForm({ 
                        ...form, 
                        sales_rep_type_id: typeId,
                        commission_rate: selectedType?.default_commission_rate != null 
                          ? String(selectedType.default_commission_rate) 
                          : ''
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm pr-8"
                  >
                    <option value="">Sin tipo asignado</option>
                    {repTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    Guardar
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
