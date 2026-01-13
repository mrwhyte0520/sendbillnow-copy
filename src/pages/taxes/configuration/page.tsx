import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { taxService, payrollSettingsService } from '../../../services/database';
import { useAuth } from '../../../hooks/useAuth';
import { formatAmount } from '../../../utils/numberFormat';

interface TaxConfiguration {
  itbis_rate: number;
  isr_rates: {
    [key: string]: number;
  };
  withholding_rates: {
    [key: string]: number;
  };
  tss_rates: {
    sfs_employee: number;      // Seguro Familiar de Salud - Empleado
    sfs_employer: number;      // Seguro Familiar de Salud - Empleador
    afp_employee: number;      // AFP - Empleado
    afp_employer: number;      // AFP - Empleador
    srl_employer: number;      // Riesgos Laborales (SRL) - Empleador
    infotep_employer: number;  // INFOTEP - Empleador
    max_salary_tss: number;    // Tope salarial cotizable TSS
  };
  other_tax_rates: {
    isc: number;
    ipi: number;
    ipi_exempt_threshold: number;
    itbi: number;
    inheritance: number;
    donation: number;
    vehicle_registration: number;
    vehicle_circulation: number;
  };
  fiscal_year_start: number;
  auto_generate_ncf: boolean;
  ncf_validation: boolean;
  report_frequency: string;
}

export default function TaxConfigurationPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<TaxConfiguration>({
    itbis_rate: 18.00,
    isr_rates: {
      'salary': 15,
      'professional_services': 10,
      'rent': 10
    },
    withholding_rates: {
      'itbis': 30,
      'isr': 27
    },
    tss_rates: {
      sfs_employee: 0,
      sfs_employer: 0,
      afp_employee: 0,
      afp_employer: 0,
      srl_employer: 0,
      infotep_employer: 0,
      max_salary_tss: 0,
    },
    other_tax_rates: {
      isc: 0,
      ipi: 0,
      ipi_exempt_threshold: 0,
      itbi: 0,
      inheritance: 0,
      donation: 0,
      vehicle_registration: 0,
      vehicle_circulation: 0,
    },
    fiscal_year_start: 1,
    auto_generate_ncf: true,
    ncf_validation: true,
    report_frequency: 'monthly'
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const { user } = useAuth();
  const [taxBrackets, setTaxBrackets] = useState<any[]>([]);
  const [loadingBrackets, setLoadingBrackets] = useState(false);

  useEffect(() => {
    loadConfiguration();
    loadTaxBrackets();
  }, [user]);

  const loadConfiguration = async () => {
    try {
      const data = await taxService.getTaxConfiguration();
      if (data) {
        const tss = data.tss_rates || {};
        const other = data.other_tax_rates || {};
        setConfig({
          itbis_rate: data.itbis_rate || 18.00,
          isr_rates: data.isr_rates || { 'salary': 15, 'professional_services': 10, 'rent': 10 },
          withholding_rates: data.withholding_rates || { 'itbis': 30, 'isr': 27 },
          tss_rates: {
            sfs_employee: tss.sfs_employee ?? 0,
            sfs_employer: tss.sfs_employer ?? 0,
            afp_employee: tss.afp_employee ?? 0,
            afp_employer: tss.afp_employer ?? 0,
            srl_employer: tss.srl_employer ?? 0,
            infotep_employer: tss.infotep_employer ?? 0,
            max_salary_tss: tss.max_salary_tss ?? 0,
          },
          other_tax_rates: {
            isc: other.isc ?? 0,
            ipi: other.ipi ?? 0,
            ipi_exempt_threshold: other.ipi_exempt_threshold ?? 0,
            itbi: other.itbi ?? 0,
            inheritance: other.inheritance ?? 0,
            donation: other.donation ?? 0,
            vehicle_registration: other.vehicle_registration ?? 0,
            vehicle_circulation: other.vehicle_circulation ?? 0,
          },
          fiscal_year_start: data.fiscal_year_start || 1,
          auto_generate_ncf: data.auto_generate_ncf ?? true,
          ncf_validation: data.ncf_validation ?? true,
          report_frequency: data.report_frequency || 'monthly'
        });
      }
    } catch (error) {
      console.error('Error loading configuration:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      await taxService.saveTaxConfiguration(config);
      setMessage({ type: 'success', text: 'Configuración guardada exitosamente' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Error al guardar la configuración' });
    } finally {
      setLoading(false);
    }
  };

  const updateIsrRate = (type: string, value: number) => {
    setConfig(prev => ({
      ...prev,
      isr_rates: {
        ...prev.isr_rates,
        [type]: value
      }
    }));
  };

  const updateTssRate = (key: keyof TaxConfiguration['tss_rates'], value: number) => {
    setConfig(prev => ({
      ...prev,
      tss_rates: {
        ...prev.tss_rates,
        [key]: value,
      },
    }));
  };

  const updateOtherTaxRate = (key: keyof TaxConfiguration['other_tax_rates'], value: number) => {
    setConfig(prev => ({
      ...prev,
      other_tax_rates: {
        ...prev.other_tax_rates,
        [key]: value,
      },
    }));
  };

  const updateWithholdingRate = (type: string, value: number) => {
    setConfig(prev => ({
      ...prev,
      withholding_rates: {
        ...prev.withholding_rates,
        [type]: value
      }
    }));
  };

  const loadTaxBrackets = async () => {
    if (!user?.id) return;
    try {
      setLoadingBrackets(true);
      const brackets = await payrollSettingsService.getPayrollTaxBrackets();
      if (brackets && brackets.length > 0) {
        setTaxBrackets(brackets);
      } else {
        // Inicializar con tramos por defecto si no hay ninguno
        const defaultBrackets = await payrollSettingsService.initializeDefaultISRBrackets(user.id);
        setTaxBrackets(defaultBrackets);
      }
    } catch (error) {
      console.error('Error loading tax brackets:', error);
    } finally {
      setLoadingBrackets(false);
    }
  };

  const handleInitializeDefaultBrackets = async () => {
    if (!user?.id) return;
    if (!confirm('¿Desea restablecer los tramos fiscales a los valores por defecto de la DGII? Esto eliminará los tramos personalizados.')) return;
    try {
      setLoadingBrackets(true);
      // Primero eliminar los existentes
      for (const bracket of taxBrackets) {
        await payrollSettingsService.deletePayrollTaxBracket(bracket.id);
      }
      // Luego crear los por defecto
      const defaultBrackets = await payrollSettingsService.initializeDefaultISRBrackets(user.id);
      setTaxBrackets(defaultBrackets);
      setMessage({ type: 'success', text: 'Tramos fiscales restablecidos a valores DGII' });
    } catch (error) {
      console.error('Error initializing default brackets:', error);
      setMessage({ type: 'error', text: 'Error al restablecer tramos fiscales' });
    } finally {
      setLoadingBrackets(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Configuración de Impuestos</h1>
            <p className="text-gray-600">Configurar tasas y parámetros fiscales</p>
          </div>
          <button
            onClick={() => navigate('/taxes')}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-arrow-left-line mr-2"></i>
            Volver a Impuestos
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 
            'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Configuration Form */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Configuración General</h3>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* ITBIS Rate */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tasa ITBIS (%)
              </label>
              <input
                type="number" min="0"
                step="0.01"
                value={config.itbis_rate}
                onChange={(e) => setConfig(prev => ({ ...prev, itbis_rate: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            {/* ISR Withholding Rates */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Retenciones ISR en Fuente (%)
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Tasas fijas de retención para pagos a terceros. El ISR de <strong>salarios</strong> se calcula con los <strong>Tramos Fiscales Progresivos</strong> configurados más abajo.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Servicios Profesionales</label>
                  <input
                    type="number" min="0"
                    step="0.01"
                    value={config.isr_rates.professional_services || 0}
                    onChange={(e) => updateIsrRate('professional_services', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Alquileres</label>
                  <input
                    type="number" min="0"
                    step="0.01"
                    value={config.isr_rates.rent || 0}
                    onChange={(e) => updateIsrRate('rent', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* TSS / Seguridad Social */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Parámetros TSS / Seguridad Social (RD)
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Configure aquí los porcentajes de aportes a la TSS (SFS, AFP, Riesgos Laborales, INFOTEP) y el tope salarial cotizable.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">SFS Empleado (%)</label>
                  <input
                    type="number" min="0"
                    step="0.01"
                    value={config.tss_rates.sfs_employee}
                    onChange={(e) => updateTssRate('sfs_employee', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">SFS Empleador (%)</label>
                  <input
                    type="number" min="0"
                    step="0.01"
                    value={config.tss_rates.sfs_employer}
                    onChange={(e) => updateTssRate('sfs_employer', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">AFP Empleado (%)</label>
                  <input
                    type="number" min="0"
                    step="0.01"
                    value={config.tss_rates.afp_employee}
                    onChange={(e) => updateTssRate('afp_employee', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">AFP Empleador (%)</label>
                  <input
                    type="number" min="0"
                    step="0.01"
                    value={config.tss_rates.afp_employer}
                    onChange={(e) => updateTssRate('afp_employer', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">SRL Empleador (%)</label>
                  <input
                    type="number" min="0"
                    step="0.01"
                    value={config.tss_rates.srl_employer}
                    onChange={(e) => updateTssRate('srl_employer', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">INFOTEP Empleador (%)</label>
                  <input
                    type="number" min="0"
                    step="0.01"
                    value={config.tss_rates.infotep_employer}
                    onChange={(e) => updateTssRate('infotep_employer', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Tope Salarial TSS (monto)</label>
                  <input
                    type="number" min="0"
                    step="0.01"
                    value={config.tss_rates.max_salary_tss}
                    onChange={(e) => updateTssRate('max_salary_tss', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Withholding Rates */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tasa de retención anual
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">ITBIS</label>
                  <input
                    type="number" min="0"
                    step="0.01"
                    value={config.withholding_rates.itbis || 0}
                    onChange={(e) => updateWithholdingRate('itbis', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">ISR</label>
                  <input
                    type="number" min="0"
                    step="0.01"
                    value={config.withholding_rates.isr || 0}
                    onChange={(e) => updateWithholdingRate('isr', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Fiscal Year */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Inicio del Año Fiscal
              </label>
              <select
                value={config.fiscal_year_start}
                onChange={(e) => setConfig(prev => ({ ...prev, fiscal_year_start: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2024, i, 1).toLocaleDateString('es-DO', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>

            {/* Report Frequency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Frecuencia de Reportes
              </label>
              <select
                value={config.report_frequency}
                onChange={(e) => setConfig(prev => ({ ...prev, report_frequency: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="monthly">Mensual</option>
                <option value="quarterly">Trimestral</option>
                <option value="annual">Anual</option>
              </select>
            </div>

            {/* Options */}
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="auto_generate_ncf"
                  checked={config.auto_generate_ncf}
                  onChange={(e) => setConfig(prev => ({ ...prev, auto_generate_ncf: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="auto_generate_ncf" className="ml-2 block text-sm text-gray-900">
                  Generar NCF automáticamente
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="ncf_validation"
                  checked={config.ncf_validation}
                  onChange={(e) => setConfig(prev => ({ ...prev, ncf_validation: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="ncf_validation" className="ml-2 block text-sm text-gray-900">
                  Validar formato de NCF
                </label>
              </div>
            </div>

            {/* ISR Tax Brackets Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Tramos Fiscales ISR - Personas Físicas (Asalariados)</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Escala progresiva anual según normativa DGII - República Dominicana
                    </p>
                  </div>
                  <button
                    onClick={handleInitializeDefaultBrackets}
                    disabled={loadingBrackets}
                    className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 whitespace-nowrap text-sm"
                  >
                    <i className="ri-refresh-line mr-2"></i>
                    Restablecer a DGII
                  </button>
                </div>
              </div>
　　 　 　 　
              <div className="p-6">
                {loadingBrackets ? (
                  <div className="text-center py-8 text-gray-500">
                    <i className="ri-loader-4-line animate-spin text-2xl"></i>
                    <p className="mt-2">Cargando tramos fiscales...</p>
                  </div>
                ) : taxBrackets.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <i className="ri-file-list-3-line text-4xl mb-2"></i>
                    <p>No hay tramos fiscales configurados</p>
                    <button
                      onClick={handleInitializeDefaultBrackets}
                      className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Cargar tramos DGII por defecto
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tramo</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Renta Desde</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Renta Hasta</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tasa (%)</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monto Fijo</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {taxBrackets.map((bracket, index) => (
                          <tr key={bracket.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                index === 0 ? 'bg-green-100 text-green-800' :
                                index === 1 ? 'bg-yellow-100 text-yellow-800' :
                                index === 2 ? 'bg-orange-100 text-orange-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {index === 0 ? 'Exento' : `Tramo ${index}`}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                               {formatAmount(bracket.min_amount)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {bracket.max_amount === null ? 'En adelante' : ` ${formatAmount(bracket.max_amount)}`}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              {bracket.rate_percent}%
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                               {formatAmount(bracket.fixed_amount)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {bracket.description || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Info Box */}
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <i className="ri-information-line text-blue-500 mt-0.5 mr-3 text-lg"></i>
                    <div>
                      <h4 className="text-sm font-medium text-blue-800">Cálculo del ISR Progresivo</h4>
                      <p className="text-sm text-blue-700 mt-1">
                        El ISR se calcula de forma progresiva: se aplica el <strong>monto fijo</strong> del tramo 
                        más el <strong>porcentaje</strong> sobre el excedente que supera el límite inferior del tramo.
                        Para retención mensual de nómina, el ISR anual calculado se divide entre 12.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {loading ? 'Guardando...' : 'Guardar Configuración'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}