import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { payrollSettingsService } from '../../../services/database';

interface PayrollSettings {
  id?: string;
  pay_frequency: string;
  overtime_rate: number;
  holiday_rate: number;
  vacation_days: number;
  sick_days: number;
  social_security_rate: number;
  health_insurance_rate: number;
  pension_rate: number;
}

interface PayrollConcept {
  id: string;
  name: string;
  type: 'income' | 'deduction' | 'benefit';
  formula: string;
  active: boolean;
}

export default function PayrollSettingsPage() {
  const [settings, setSettings] = useState<PayrollSettings>({
    pay_frequency: 'monthly',
    overtime_rate: 1.5,
    holiday_rate: 2.0,
    vacation_days: 14,
    sick_days: 10,
    social_security_rate: 2.87,
    health_insurance_rate: 3.04,
    pension_rate: 2.87
  });
  const [concepts, setConcepts] = useState<PayrollConcept[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newConcept, setNewConcept] = useState({ name: '', type: 'income' as const, formula: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
    loadConcepts();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await payrollSettingsService.getPayrollSettings();

      if (data) {
        setSettings({
          id: data.id,
          pay_frequency: data.pay_frequency || 'monthly',
          overtime_rate: typeof data.overtime_rate === 'number' ? data.overtime_rate : 1.5,
          holiday_rate: typeof data.holiday_rate === 'number' ? data.holiday_rate : 2.0,
          vacation_days: typeof data.vacation_days === 'number' ? data.vacation_days : 14,
          sick_days: typeof data.sick_days === 'number' ? data.sick_days : 10,
          social_security_rate: typeof data.social_security_rate === 'number' ? data.social_security_rate : 2.87,
          health_insurance_rate: typeof data.health_insurance_rate === 'number' ? data.health_insurance_rate : 3.04,
          pension_rate: typeof data.pension_rate === 'number' ? data.pension_rate : 2.87,
        });
      }
    } catch (error) {
      console.error('Error loading payroll settings:', error);
    }
  };

  const loadConcepts = async () => {
    try {
      const data = await payrollSettingsService.getPayrollConcepts();

      setConcepts(data);
    } catch (error) {
      console.error('Error loading payroll concepts:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      await payrollSettingsService.savePayrollSettings(settings);

      setMessage({ type: 'success', text: 'Configuración de nómina guardada exitosamente' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Error al guardar la configuración' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateConcept = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await payrollSettingsService.createPayrollConcept(newConcept);

      setMessage({ type: 'success', text: 'Concepto de nómina creado exitosamente' });
      setShowModal(false);
      setNewConcept({ name: '', type: 'income', formula: '' });

      loadConcepts();
    } catch (error) {
      setMessage({ type: 'error', text: 'Error al crear el concepto' });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof PayrollSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Configuración de Nómina</h1>
              <p className="text-gray-600 mt-1">
                Configura conceptos de nómina, deducciones y beneficios
              </p>
            </div>
            <button
              onClick={() => window.REACT_APP_NAVIGATE('/settings')}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
            >
              <i className="ri-arrow-left-line"></i>
              <span>Volver a Configuración</span>
            </button>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Settings */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Configuración Básica</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Frecuencia de Pago *
                </label>
                <select
                  value={settings.pay_frequency}
                  onChange={(e) => handleInputChange('pay_frequency', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Días de Vacaciones Anuales
                </label>
                <input
                  type="number"
                  min="0"
                  value={settings.vacation_days ?? 0}
                  onChange={(e) => handleInputChange('vacation_days', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Días de Enfermedad Anuales
                </label>
                <input
                  type="number"
                  min="0"
                  value={settings.sick_days ?? 0}
                  onChange={(e) => handleInputChange('sick_days', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Overtime and Holiday Rates */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Tasas de Horas Extra y Feriados</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tasa de Horas Extra (multiplicador)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  value={settings.overtime_rate ?? 0}
                  onChange={(e) => handleInputChange('overtime_rate', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tasa de Días Feriados (multiplicador)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  value={settings.holiday_rate ?? 0}
                  onChange={(e) => handleInputChange('holiday_rate', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Social Security Rates */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Tasas de Seguridad Social (República Dominicana)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seguro Social (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={settings.social_security_rate ?? 0}
                  onChange={(e) => handleInputChange('social_security_rate', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seguro de Salud (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={settings.health_insurance_rate ?? 0}
                  onChange={(e) => handleInputChange('health_insurance_rate', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fondo de Pensiones (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={settings.pension_rate ?? 0}
                  onChange={(e) => handleInputChange('pension_rate', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => window.REACT_APP_NAVIGATE('/settings')}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>

        {/* Payroll Concepts Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Conceptos de Nómina</h2>
            <button
              onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <i className="ri-add-line"></i>
              <span>Nuevo Concepto</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nombre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fórmula
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {concepts.map((concept) => (
                  <tr key={concept.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {concept.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        concept.type === 'income' ? 'bg-green-100 text-green-800' :
                        concept.type === 'deduction' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {concept.type === 'income' ? 'Ingreso' : 
                         concept.type === 'deduction' ? 'Deducción' : 'Beneficio'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {concept.formula}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        concept.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {concept.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button className="text-blue-600 hover:text-blue-900">
                          <i className="ri-edit-line"></i>
                        </button>
                        <button className="text-red-600 hover:text-red-900">
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
      </div>

      {/* New Concept Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Nuevo Concepto de Nómina</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
            <form onSubmit={handleCreateConcept} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  required
                  value={newConcept.name}
                  onChange={(e) => setNewConcept(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo *
                </label>
                <select
                  required
                  value={newConcept.type}
                  onChange={(e) => setNewConcept(prev => ({ ...prev, type: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="income">Ingreso</option>
                  <option value="deduction">Deducción</option>
                  <option value="benefit">Beneficio</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fórmula *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: salario_base * 0.1"
                  value={newConcept.formula}
                  onChange={(e) => setNewConcept(prev => ({ ...prev, formula: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Creando...' : 'Crear Concepto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}