import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { assetDepreciationTypesService } from '../../../services/database';

interface DepreciationType {
  id: string;
  code: string;
  name: string;
  method: string;
  usefulLifeMonths: number | null;
  annualRate: number | null;
  description: string;
  createdAt: string;
}

export default function DepreciationTypesPage() {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState<DepreciationType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [types, setTypes] = useState<DepreciationType[]>([]);
  const [codeValue, setCodeValue] = useState('');

  useEffect(() => {
    const loadTypes = async () => {
      if (!user) return;
      try {
        const data = await assetDepreciationTypesService.getAll(user.id);
        const mapped: DepreciationType[] = (data || []).map((t: any) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          method: t.method || '',
          usefulLifeMonths: t.useful_life_months ?? null,
          annualRate: t.annual_rate != null ? Number(t.annual_rate) || 0 : null,
          description: t.description || '',
          createdAt: t.created_at || new Date().toISOString(),
        }));
        setTypes(mapped);
      } catch (error) {
        console.error('Error loading depreciation types:', error);
      }
    };

    loadTypes();
  }, [user]);

  const handleAddType = () => {
    setEditingType(null);
    setCodeValue('');
    setShowModal(true);
  };

  const handleEditType = (type: DepreciationType) => {
    setEditingType(type);
    setCodeValue(type.code);
    setShowModal(true);
  };

  const handleDeleteType = async (typeId: string) => {
    if (!user) return;
    if (!confirm('¿Está seguro de que desea eliminar este tipo de depreciación?')) return;
    try {
      await assetDepreciationTypesService.delete(typeId);
      setTypes(prev => prev.filter(type => type.id !== typeId));
    } catch (error) {
      console.error('Error deleting depreciation type:', error);
      alert('Error al eliminar el tipo de depreciación');
    }
  };

  const handleGenerateCode = () => {
    // Generar un código simple basado en la cantidad existente, ej: DEP-001, DEP-002, etc.
    const base = 'DEP';
    const nextNumber = types.length + 1;
    const padded = String(nextNumber).padStart(3, '0');
    setCodeValue(`${base}-${padded}`);
  };

  const handleSaveType = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    const usefulLifeYearsRaw = formData.get('usefulLifeYears');
    const usefulLifeYears = usefulLifeYearsRaw != null && String(usefulLifeYearsRaw).trim() !== ''
      ? Number(usefulLifeYearsRaw)
      : null;
    const payload: any = {
      code: String(formData.get('code') || '').trim(),
      name: String(formData.get('name') || '').trim(),
      method: String(formData.get('method') || '').trim() || null,
      useful_life_months:
        usefulLifeYears != null
          ? Math.max(1, Math.round(usefulLifeYears * 12))
          : null,
      annual_rate: formData.get('annualRate')
        ? Number(formData.get('annualRate')) || 0
        : null,
      description: String(formData.get('description') || '').trim() || null,
    };

    if (!payload.code || !payload.name) {
      alert('Código y nombre son obligatorios');
      return;
    }

    try {
      if (editingType) {
        const updated = await assetDepreciationTypesService.update(editingType.id, payload);
        const mapped: DepreciationType = {
          id: updated.id,
          code: updated.code,
          name: updated.name,
          method: updated.method || '',
          usefulLifeMonths: updated.useful_life_months ?? null,
          annualRate: updated.annual_rate != null ? Number(updated.annual_rate) || 0 : null,
          description: updated.description || '',
          createdAt: updated.created_at || new Date().toISOString(),
        };
        setTypes(prev => prev.map(type => type.id === editingType.id ? mapped : type));
      } else {
        const created = await assetDepreciationTypesService.create(user.id, payload);
        const mapped: DepreciationType = {
          id: created.id,
          code: created.code,
          name: created.name,
          method: created.method || '',
          usefulLifeMonths: created.useful_life_months ?? null,
          annualRate: created.annual_rate != null ? Number(created.annual_rate) || 0 : null,
          description: created.description || '',
          createdAt: created.created_at || new Date().toISOString(),
        };
        setTypes(prev => [mapped, ...prev]);
      }

      setShowModal(false);
      setEditingType(null);
      form.reset();
    } catch (error) {
      console.error('Error saving depreciation type:', error);
      alert('Error al guardar el tipo de depreciación');
    }
  };

  const methods = [
    'Línea Recta',
    'Suma de Dígitos',
    'Saldo Decreciente',
    'Unidades de Producción',
  ];

  const filteredTypes = types.filter(type => {
    const term = searchTerm.toLowerCase();
    return (
      type.code.toLowerCase().includes(term) ||
      type.name.toLowerCase().includes(term) ||
      type.description.toLowerCase().includes(term)
    );
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tipos de Depreciación</h1>
            <p className="text-sm text-gray-600 mt-1">
              Catálogo de métodos y parámetros de depreciación para activos fijos.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código, nombre o descripción"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleAddType}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-add-line mr-1" />
              Nuevo Tipo
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="min-w-full overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Método</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Vida Útil (años)</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Tasa Anual (%)</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTypes.map((type) => (
                  <tr key={type.id}>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{type.code}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{type.name}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{type.method || '-'}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                      {type.usefulLifeMonths != null ? (type.usefulLifeMonths / 12).toFixed(2) : '-'}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                      {type.annualRate != null ? type.annualRate.toFixed(2) : '-'}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                      {type.description || '-'}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right">
                      <button
                        onClick={() => handleEditType(type)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        <i className="ri-edit-line" />
                      </button>
                      <button
                        onClick={() => handleDeleteType(type.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <i className="ri-delete-bin-line" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredTypes.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-sm text-gray-500 text-center" colSpan={7}>
                      No hay tipos de depreciación registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingType ? 'Editar Tipo de Depreciación' : 'Nuevo Tipo de Depreciación'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl" />
                </button>
              </div>

              <form onSubmit={handleSaveType} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Código *
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        name="code"
                        required
                        value={codeValue}
                        onChange={(e) => setCodeValue(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Ej: LINEAL-10"
                      />
                      <button
                        type="button"
                        onClick={handleGenerateCode}
                        className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-200 transition-colors whitespace-nowrap text-sm"
                      >
                        Generar
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre *
                    </label>
                    <input
                      type="text"
                      name="name"
                      required
                      defaultValue={editingType?.name || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Línea Recta 10%"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Método
                    </label>
                    <select
                      name="method"
                      defaultValue={editingType?.method || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar método</option>
                      {methods.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Vida Útil (años)
                    </label>
                    <input
                      type="number"
                      name="usefulLifeYears"
                      min="1"
                      step="0.01"
                      defaultValue={
                        editingType?.usefulLifeMonths != null
                          ? String(editingType.usefulLifeMonths / 12)
                          : ''
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ej: 10"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tasa Anual (%)
                    </label>
                    <input
                      type="number"
                      name="annualRate"
                      step="0.01"
                      min="0"
                      max="100"
                      defaultValue={editingType?.annualRate ?? ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ej: 10.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descripción
                  </label>
                  <textarea
                    name="description"
                    rows={3}
                    defaultValue={editingType?.description || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Descripción del método y política de depreciación"
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
                    {editingType ? 'Actualizar' : 'Crear'} Tipo
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
