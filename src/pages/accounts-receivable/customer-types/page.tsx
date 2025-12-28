import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { customerTypesService, chartAccountsService } from '../../../services/database';

interface CustomerType {
  id: string;
  name: string;
  description: string;
  fixedDiscount: number;
  creditLimit: number;
  allowedDelayDays: number;
  noTax: boolean;
  arAccountId?: string | null;
}

export default function CustomerTypesPage() {
  const { user } = useAuth();
  const [types, setTypes] = useState<CustomerType[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedType, setSelectedType] = useState<CustomerType | null>(null);

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [list, accs] = await Promise.all([
        customerTypesService.getAll(user.id),
        chartAccountsService.getAll(user.id),
      ]);
      setTypes(list || []);
      setAccounts(accs || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const arAccounts = accounts.filter((acc) => {
    if (!acc.allowPosting) return false;
    if (acc.type !== 'asset') return false;
    const name = String(acc.name || '').toLowerCase();
    return name.includes('cuentas por cobrar');
  });

  const handleNew = () => {
    setSelectedType(null);
    setShowModal(true);
  };

  const handleEdit = (t: CustomerType) => {
    setSelectedType(t);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id) return;
    const form = new FormData(e.currentTarget);
    const payload: any = {
      name: String(form.get('name') || ''),
      description: String(form.get('description') || ''),
      fixedDiscount: Number(form.get('fixedDiscount') || 0) || 0,
      creditLimit: Number(form.get('creditLimit') || 0) || 0,
      allowedDelayDays: Number(form.get('allowedDelayDays') || 0) || 0,
      noTax: String(form.get('noTax') || 'false') === 'true',
      arAccountId: String(form.get('arAccountId') || ''),
    };

    try {
      if (selectedType) {
        await customerTypesService.update(selectedType.id, payload);
      } else {
        await customerTypesService.create(user.id, payload);
      }
      await loadData();
      setShowModal(false);
      setSelectedType(null);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[CustomerTypes] Error saving type', error);
      alert(`Error al guardar el tipo de cliente: ${error?.message || 'revisa la consola'}`);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tipos de Clientes</h1>
            <nav className="flex space-x-2 text-sm text-gray-600 mt-2">
              <Link to="/accounts-receivable" className="hover:text-blue-600">Cuentas por Cobrar</Link>
              <span>/</span>
              <span>Tipos de Clientes</span>
            </nav>
          </div>
          <button
            onClick={handleNew}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2"></i>
            Nuevo Tipo
          </button>
        </div>

        {loading && (
          <div className="mb-2 text-sm text-gray-500">Cargando tipos de clientes...</div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descuento fijo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Límite crédito sugerido</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Días de atraso</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sin ITBIS</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cuenta CxC</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {types.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <div>{t.name}</div>
                      {t.description && (
                        <div className="text-xs text-gray-500">{t.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {t.fixedDiscount.toLocaleString()}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      RD${t.creditLimit.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {t.allowedDelayDays} días
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {t.noTax ? 'Sí' : 'No'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(t as any).arAccountCode || ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleEdit(t)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <i className="ri-edit-line"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  {selectedType ? 'Editar Tipo de Cliente' : 'Nuevo Tipo de Cliente'}
                </h3>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setSelectedType(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nombre <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      name="name"
                      required
                      defaultValue={selectedType?.name || ''}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Descuento fijo (%)</label>
                    <input
                      type="number" min="0"
                      name="fixedDiscount"
                      step="0.01"
                      defaultValue={selectedType?.fixedDiscount ?? 0}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Descripción</label>
                  <textarea
                    name="description"
                    rows={2}
                    defaultValue={selectedType?.description || ''}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Límite de crédito sugerido</label>
                    <input
                      type="number" min="0"
                      name="creditLimit"
                      step="0.01"
                      defaultValue={selectedType?.creditLimit ?? 0}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Días de atraso permitidos</label>
                    <input
                      type="number" min="0"
                      name="allowedDelayDays"
                      defaultValue={selectedType?.allowedDelayDays ?? 0}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Facturar sin ITBIS</label>
                    <select
                      name="noTax"
                      defaultValue={selectedType?.noTax ? 'true' : 'false'}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="false">No</option>
                      <option value="true">Sí</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cuenta por Cobrar (moneda principal)</label>
                    <select
                      name="arAccountId"
                      defaultValue={selectedType?.arAccountId || ''}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="">Usar cuenta por defecto</option>
                      {arAccounts.map((acc: any) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setSelectedType(null);
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
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
