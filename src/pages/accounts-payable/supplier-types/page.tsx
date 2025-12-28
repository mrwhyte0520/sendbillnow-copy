import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { supplierTypesService } from '../../../services/database';

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
      alert('Debes iniciar sesión para gestionar tipos de suplidor');
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
      alert(editingType ? 'Tipo de suplidor actualizado' : 'Tipo de suplidor creado');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error saving supplier type', error);
      alert('Error al guardar el tipo de suplidor');
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
      alert('Debes iniciar sesión para eliminar tipos de suplidor');
      return;
    }
    if (!confirm('¿Eliminar este tipo de suplidor?')) return;

    try {
      await supplierTypesService.delete(id);
      await loadTypes();
      alert('Tipo de suplidor eliminado');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error deleting supplier type', error);
      alert('No se pudo eliminar el tipo de suplidor');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tipos de Suplidor</h1>
            <p className="text-gray-600">Catálogo de tipos de proveedores para configuración fiscal y contable</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2" />
            Nuevo Tipo
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Lista de Tipos de Suplidor</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Configuración</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {types.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{t.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-700 max-w-md truncate">{t.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div className="flex flex-wrap gap-1">
                        {t.affects_itbis && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-50 text-indigo-700">Afecta ITBIS</span>
                        )}
                        {t.affects_isr && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-700">Afecta ISR</span>
                        )}
                        {t.is_rst && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700">RST</span>
                        )}
                        {t.is_ong && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-purple-50 text-purple-700">ONG</span>
                        )}
                        {t.is_non_taxpayer && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-red-50 text-red-700">No contribuyente</span>
                        )}
                        {t.is_government && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">Gobierno</span>
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
                      No hay tipos de suplidor registrados.
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
                  {editingType ? 'Editar Tipo de Suplidor' : 'Nuevo Tipo de Suplidor'}
                </h3>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nombre *</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Descripción</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Retención ISR (Persona Física)</label>
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
                    <option value="">Sin especificar</option>
                    {isrWithholdingRateOptions.map((rate) => (
                      <option key={rate} value={rate}>{rate} %</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Esta tasa se aplica automáticamente solo para suplidores clasificados como Persona Física.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Retención ITBIS</label>
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
                    <option value="">Sin especificar</option>
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
                    Afecta ITBIS
                  </label>
                  <label className="inline-flex items-center text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.affects_isr}
                      onChange={(e) => setFormData({ ...formData, affects_isr: e.target.checked })}
                      className="mr-2"
                    />
                    Afecta ISR
                  </label>
                  <label className="inline-flex items-center text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.is_rst}
                      onChange={(e) => setFormData({ ...formData, is_rst: e.target.checked })}
                      className="mr-2"
                    />
                    Régimen RST
                  </label>
                  <label className="inline-flex items-center text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.is_ong}
                      onChange={(e) => setFormData({ ...formData, is_ong: e.target.checked })}
                      className="mr-2"
                    />
                    ONG / Fundación
                  </label>
                  <label className="inline-flex items-center text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.is_non_taxpayer}
                      onChange={(e) => setFormData({ ...formData, is_non_taxpayer: e.target.checked })}
                      className="mr-2"
                    />
                    No contribuyente
                  </label>
                  <label className="inline-flex items-center text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.is_government}
                      onChange={(e) => setFormData({ ...formData, is_government: e.target.checked })}
                      className="mr-2"
                    />
                    Gobierno / Entidad Pública
                  </label>
                </div>

                {formData.is_government && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Factura Habitual</label>
                      <select
                        value={formData.default_invoice_type}
                        onChange={(e) => setFormData({ ...formData, default_invoice_type: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Seleccionar tipo</option>
                        <option value="01">01 - Factura de Crédito Fiscal</option>
                        <option value="02">02 - Factura de Consumo</option>
                        <option value="03">03 - Nota de Débito</option>
                        <option value="04">04 - Nota de Crédito</option>
                        <option value="11">11 - Comprobante de Compras</option>
                        <option value="12">12 - Registro Único de Ingresos</option>
                        <option value="13">13 - Gastos Menores</option>
                        <option value="14">14 - Regímenes Especiales</option>
                        <option value="15">15 - Comprobante Gubernamental</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Régimen Tributario</label>
                      <select
                        value={formData.tax_regime}
                        onChange={(e) => setFormData({ ...formData, tax_regime: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Seleccionar régimen</option>
                        <option value="ordinario">Ordinario</option>
                        <option value="simplificado">Régimen Simplificado de Tributación (RST)</option>
                        <option value="exento">Exento</option>
                        <option value="especial">Régimen Especial</option>
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
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
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
