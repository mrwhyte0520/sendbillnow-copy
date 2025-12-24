import { useState, useEffect } from 'react';
import { usePlans } from '../../hooks/usePlans';
import { useAuth } from '../../hooks/useAuth';
import { accountingSettingsService, taxService } from '../../services/database';

interface InitialSetupModalProps {
  onComplete?: () => void;
}

export default function InitialSetupModal({ onComplete }: InitialSetupModalProps) {
  const { user } = useAuth();
  const { currentPlan } = usePlans();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<'check' | 'fiscal' | 'ncf' | 'done'>('check');
  const [loading, setLoading] = useState(false);
  const [hasAccountingSettings, setHasAccountingSettings] = useState<boolean | null>(null);
  const [hasNcfSeries, setHasNcfSeries] = useState<boolean | null>(null);

  // Form states
  const [fiscalYearStart, setFiscalYearStart] = useState(new Date().getFullYear() + '-01-01');
  const [fiscalYearEnd, setFiscalYearEnd] = useState(new Date().getFullYear() + '-12-31');
  const [defaultCurrency, setDefaultCurrency] = useState('DOP');
  
  const [ncfDocType, setNcfDocType] = useState('B02');
  const [ncfPrefix, setNcfPrefix] = useState('B02');
  const [ncfStartNumber, setNcfStartNumber] = useState(1);
  const [ncfEndNumber, setNcfEndNumber] = useState(500);

  // Planes que requieren configuración contable
  const premiumPlans = ['pos-premium', 'pos-super-plus'];
  const currentPlanId = typeof currentPlan === 'string' ? currentPlan : (currentPlan as any)?.id || '';
  const requiresSetup = premiumPlans.includes(currentPlanId);

  useEffect(() => {
    const checkSetup = async () => {
      if (!user?.id || !requiresSetup) {
        setShow(false);
        return;
      }

      try {
        // Verificar configuración contable
        const settings = await accountingSettingsService.get(user.id);
        const hasSettings = !!(settings?.fiscal_year_start && settings?.fiscal_year_end);
        setHasAccountingSettings(hasSettings);

        // Verificar series NCF
        const series = await taxService.getNcfSeries(user.id);
        const hasActiveSeries = (series || []).some((s: any) => s.status === 'active');
        setHasNcfSeries(hasActiveSeries);

        // Mostrar modal si falta alguna configuración
        if (!hasSettings || !hasActiveSeries) {
          setShow(true);
          setStep(!hasSettings ? 'fiscal' : 'ncf');
        }
      } catch (error) {
        console.error('Error checking setup:', error);
      }
    };

    checkSetup();
  }, [user?.id, currentPlan, requiresSetup]);

  const handleSaveFiscalYear = async () => {
    if (!user?.id) return;
    setLoading(true);

    try {
      await accountingSettingsService.save({
        fiscal_year_start: fiscalYearStart,
        fiscal_year_end: fiscalYearEnd,
        default_currency: defaultCurrency,
      }, user.id);

      setHasAccountingSettings(true);
      
      if (!hasNcfSeries) {
        setStep('ncf');
      } else {
        setStep('done');
        setTimeout(() => {
          setShow(false);
          onComplete?.();
        }, 2000);
      }
    } catch (error) {
      console.error('Error saving fiscal year:', error);
      alert('Error al guardar la configuración fiscal');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNcf = async () => {
    if (!user?.id) return;
    setLoading(true);

    try {
      await taxService.createNcfSeries({
        user_id: user.id,
        document_type: ncfDocType,
        prefix: ncfPrefix,
        start_number: ncfStartNumber,
        end_number: ncfEndNumber,
        current_number: ncfStartNumber,
        status: 'active',
      });

      setHasNcfSeries(true);
      setStep('done');
      setTimeout(() => {
        setShow(false);
        onComplete?.();
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error('Error saving NCF series:', error);
      alert('Error al guardar la serie NCF');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    if (step === 'fiscal' && !hasNcfSeries) {
      setStep('ncf');
    } else {
      setShow(false);
      onComplete?.();
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      
      <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-center">
          <div className="w-16 h-16 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-3 backdrop-blur-sm">
            <i className={`${step === 'done' ? 'ri-check-line' : 'ri-settings-3-line'} text-3xl text-white`}></i>
          </div>
          <h3 className="text-xl font-bold text-white">
            {step === 'done' ? '¡Configuración Completa!' : 'Configuración Inicial'}
          </h3>
          <p className="text-blue-100 text-sm mt-1">
            {step === 'done' 
              ? 'Tu sistema está listo para usar'
              : 'Completa la configuración para usar todas las funciones'}
          </p>
        </div>

        {/* Content */}
        <div className="p-5">
          {step === 'fiscal' && (
            <>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-1">Período Fiscal</h4>
                <p className="text-sm text-gray-600">Define el año fiscal de tu empresa</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Inicio</label>
                    <input
                      type="date"
                      value={fiscalYearStart}
                      onChange={(e) => setFiscalYearStart(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fin</label>
                    <input
                      type="date"
                      value={fiscalYearEnd}
                      onChange={(e) => setFiscalYearEnd(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Moneda Principal</label>
                  <select
                    value={defaultCurrency}
                    onChange={(e) => setDefaultCurrency(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="DOP">Peso Dominicano (DOP)</option>
                    <option value="USD">Dólar Americano (USD)</option>
                    <option value="EUR">Euro (EUR)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSkip}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Más tarde
                </button>
                <button
                  onClick={handleSaveFiscalYear}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Guardando...' : 'Continuar'}
                </button>
              </div>
            </>
          )}

          {step === 'ncf' && (
            <>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-1">Secuencia NCF</h4>
                <p className="text-sm text-gray-600">Configura tu secuencia de comprobantes fiscales (DGII)</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Documento</label>
                    <select
                      value={ncfDocType}
                      onChange={(e) => {
                        setNcfDocType(e.target.value);
                        setNcfPrefix(e.target.value);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="B01">B01 - Crédito Fiscal</option>
                      <option value="B02">B02 - Consumidor Final</option>
                      <option value="B14">B14 - Régimen Especial</option>
                      <option value="B15">B15 - Gubernamental</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prefijo</label>
                    <input
                      type="text"
                      value={ncfPrefix}
                      onChange={(e) => setNcfPrefix(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Número Inicial</label>
                    <input
                      type="number"
                      value={ncfStartNumber}
                      onChange={(e) => setNcfStartNumber(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Número Final</label>
                    <input
                      type="number"
                      value={ncfEndNumber}
                      onChange={(e) => setNcfEndNumber(parseInt(e.target.value) || 500)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSkip}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Más tarde
                </button>
                <button
                  onClick={handleSaveNcf}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Guardando...' : 'Finalizar'}
                </button>
              </div>
            </>
          )}

          {step === 'done' && (
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
                <i className="ri-check-double-line text-3xl text-green-600"></i>
              </div>
              <p className="text-gray-600">
                Tu configuración ha sido guardada correctamente. 
                El sistema se actualizará automáticamente.
              </p>
            </div>
          )}
        </div>

        {/* Progress indicator */}
        {step !== 'done' && (
          <div className="px-5 pb-4">
            <div className="flex items-center justify-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${step === 'fiscal' ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
              <div className={`w-2 h-2 rounded-full ${step === 'ncf' ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
