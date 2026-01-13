import { useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { payrollSettingsService, settingsService } from '../../services/database';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { useAuth } from '../../hooks/useAuth';
import { usePlanPermissions } from '../../hooks/usePlanPermissions';

interface SettingsSection {
  id: string;
  name: string;
  description: string;
  icon: string;
  href: string;
}

interface ChangeHistoryItem {
  id: string;
  section: string;
  action: string;
  user: string;
  timestamp: string;
  details: string;
}

const settingsSections: SettingsSection[] = [
  {
    id: 'company',
    name: 'Company Information',
    description: 'Configure basic company data, logo, and contact details',
    icon: 'ri-building-line',
    href: '/settings/company'
  }
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { canAccessRoute, getRequiredPlanForRoute } = usePlanPermissions();
  const [searchTerm, setSearchTerm] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showRestrictedModal, setShowRestrictedModal] = useState(false);
  const [restrictedSectionName, setRestrictedSectionName] = useState('');
  const [restrictedPlanName, setRestrictedPlanName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const filteredSections = settingsSections.filter(section =>
    section.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    section.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSectionClick = (href: string) => {
    window.REACT_APP_NAVIGATE(href);
  };

  const handleExportConfiguration = async () => {
    if (!user?.id) {
      setMessage({ type: 'error', text: 'User not authenticated. Sign in to export the configuration.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    
    try {
      // Obtener todas las configuraciones del sistema
      const [
        companyInfo, 
        accountingSettings, 
        taxSettings, 
        inventorySettings, 
        payrollSettings,
        taxRates,
        warehouses,
        payrollConcepts
      ] = await Promise.all([
        settingsService.getCompanyInfo(),
        settingsService.getAccountingSettings(user.id),
        settingsService.getTaxSettings(),
        settingsService.getInventorySettings(),
        payrollSettingsService.getPayrollSettings(),
        settingsService.getTaxRates(),
        settingsService.getWarehouses(),
        payrollSettingsService.getPayrollConcepts()
      ]);

      const wb = new ExcelJS.Workbook();

      const addStyledSheet = (sheetName: string, headers: string[], data: (string | number | boolean)[][]) => {
        const ws = wb.addWorksheet(sheetName);
        const headerRow = ws.getRow(1);
        headers.forEach((h, idx) => {
          const cell = headerRow.getCell(idx + 1);
          cell.value = h;
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
        });
        data.forEach((row, rowIdx) => {
          const dataRow = ws.getRow(rowIdx + 2);
          row.forEach((val, colIdx) => {
            dataRow.getCell(colIdx + 1).value = val;
          });
        });
        headers.forEach((_, idx) => {
          ws.getColumn(idx + 1).width = 25;
        });
      };

      // Hoja 1: Información de la Empresa
      if (companyInfo) {
        addStyledSheet('Información Empresa', ['Campo', 'Valor'], [
          ['Nombre de la Empresa', companyInfo.name || ''],
          ['RNC', companyInfo.rnc || ''],
          ['Dirección', companyInfo.address || ''],
          ['Teléfono', companyInfo.phone || ''],
          ['Email', companyInfo.email || ''],
          ['Sitio Web', companyInfo.website || ''],
          ['Sector', companyInfo.sector || ''],
          ['Tipo de Empresa', companyInfo.company_type || '']
        ]);
      }

      // Hoja 2: Configuración Contable
      if (accountingSettings) {
        addStyledSheet('Config Contable', ['Campo', 'Valor'], [
          ['Inicio Año Fiscal', accountingSettings.fiscal_year_start || ''],
          ['Fin Año Fiscal', accountingSettings.fiscal_year_end || ''],
          ['Moneda por Defecto', accountingSettings.default_currency || ''],
          ['Decimales', accountingSettings.decimal_places || ''],
          ['Formato de Fecha', accountingSettings.date_format || ''],
          ['Formato de Números', accountingSettings.number_format || ''],
          ['Respaldo Automático', accountingSettings.auto_backup ? 'Sí' : 'No'],
          ['Frecuencia de Respaldo', accountingSettings.backup_frequency || ''],
          ['Período de Retención', accountingSettings.retention_period || '']
        ]);
      }

      // Hoja 3: Configuración de Impuestos
      if (taxSettings) {
        addStyledSheet('Config Impuestos', ['Campo', 'Valor'], [
          ['Tasa ITBIS (%)', taxSettings.itbis_rate || ''],
          ['Tasa ISR (%)', taxSettings.isr_rate || ''],
          ['Tasa Retención (%)', taxSettings.retention_rate || ''],
          ['Frecuencia Declaración', taxSettings.declaration_frequency || ''],
          ['Inicio Año Fiscal', taxSettings.fiscal_year_start || ''],
          ['Fin Año Fiscal', taxSettings.fiscal_year_end || '']
        ]);
      }

      // Hoja 4: Configuración de Inventario
      if (inventorySettings) {
        addStyledSheet('Config Inventario', ['Campo', 'Valor'], [
          ['Método de Valuación', inventorySettings.valuation_method || ''],
          ['Reorden Automático', inventorySettings.auto_reorder ? 'Sí' : 'No'],
          ['Rastrear Números de Serie', inventorySettings.track_serial_numbers ? 'Sí' : 'No'],
          ['Rastrear Fechas de Vencimiento', inventorySettings.track_expiration_dates ? 'Sí' : 'No'],
          ['Almacén por Defecto', inventorySettings.default_warehouse || '']
        ]);
      }

      // Hoja 5: Configuración de Nómina
      if (payrollSettings) {
        addStyledSheet('Config Nómina', ['Campo', 'Valor'], [
          ['Frecuencia de Pago', payrollSettings.pay_frequency || ''],
          ['Tasa Horas Extra', payrollSettings.overtime_rate || ''],
          ['Tasa Seguro Social (%)', payrollSettings.social_security_rate || ''],
          ['Tasa AFP (%)', payrollSettings.afp_rate || ''],
          ['Tasa SFS (%)', payrollSettings.sfs_rate || ''],
          ['Bono Navideño', payrollSettings.christmas_bonus ? 'Sí' : 'No'],
          ['Días de Vacaciones', payrollSettings.vacation_days || '']
        ]);
      }

      // Hoja 6: Tasas de Impuestos
      if (taxRates && taxRates.length > 0) {
        const taxRatesRows = taxRates.map((rate: any) => [
          rate.name || '',
          rate.type || '',
          rate.rate || '',
          rate.description || '',
          rate.is_active ? 'Sí' : 'No'
        ]);
        addStyledSheet('Tasas Impuestos', ['Nombre', 'Tipo', 'Tasa (%)', 'Descripción', 'Activo'], taxRatesRows);
      }

      // Hoja 7: Almacenes
      if (warehouses && warehouses.length > 0) {
        const warehousesRows = warehouses.map((wh: any) => [
          wh.name || '',
          wh.code || '',
          wh.address || '',
          wh.phone || '',
          wh.manager || '',
          wh.is_active ? 'Sí' : 'No'
        ]);
        addStyledSheet('Almacenes', ['Nombre', 'Código', 'Dirección', 'Teléfono', 'Responsable', 'Activo'], warehousesRows);
      }

      // Hoja 8: Conceptos de Nómina
      if (payrollConcepts && payrollConcepts.length > 0) {
        const conceptsRows = payrollConcepts.map((c: any) => [
          c.name || '',
          c.code || '',
          c.type || '',
          c.formula || '',
          c.is_active ? 'Sí' : 'No'
        ]);
        addStyledSheet('Conceptos Nómina', ['Nombre', 'Código', 'Tipo', 'Fórmula', 'Activo'], conceptsRows);
      }

      // Hoja 9: Información de Exportación
      addStyledSheet('Info Exportación', ['Campo', 'Valor'], [
        ['Fecha de Exportación', new Date().toLocaleString('es-DO')],
        ['Sistema', 'Sendbillnow'],
        ['Versión', '1.0'],
        ['Usuario', 'Administrador'],
        ['Descripción', 'Configuración completa del sistema contable']
      ]);

      // Generar y descargar el archivo Excel
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `contabi-configuration-${new Date().toISOString().split('T')[0]}.xlsx`;
      saveAs(blob, fileName);

      setMessage({ 
        type: 'success', 
        text: 'Configuration exported successfully to Excel. The file has been downloaded.' 
      });
    } catch (error) {
      console.error('Error exporting configuration:', error);
      setMessage({ 
        type: 'error', 
        text: 'Error exporting configuration. Please try again.' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImportConfiguration = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setLoading(true);
      setMessage(null);
      
      try {
        const text = await file.text();
        const configData = JSON.parse(text);

        // Validar estructura del archivo
        if (!configData.exportInfo || !configData.exportInfo.version) {
          throw new Error('Archivo de configuración inválido o corrupto');
        }

        // Verificar que es un archivo de Sendbillnow
        if (configData.exportInfo.systemName !== 'Sendbillnow') {
          throw new Error('Este archivo no es compatible con Sendbillnow');
        }

        let importedSections = 0;

        // Importar configuraciones una por una
        if (configData.companyInfo) {
          await settingsService.saveCompanyInfo(configData.companyInfo);
          importedSections++;
        }

        if (configData.accountingSettings) {
          await settingsService.saveAccountingSettings(configData.accountingSettings);
          importedSections++;
        }

        if (configData.taxSettings) {
          await settingsService.saveTaxSettings(configData.taxSettings);
          importedSections++;
        }

        if (configData.inventorySettings) {
          await settingsService.saveInventorySettings(configData.inventorySettings);
          importedSections++;
        }

        if (configData.payrollSettings) {
          await payrollSettingsService.savePayrollSettings(configData.payrollSettings);
          importedSections++;
        }

        // Importar tasas de impuestos
        if (configData.taxRates && Array.isArray(configData.taxRates)) {
          for (const rate of configData.taxRates) {
            try {
              await settingsService.createTaxRate(rate);
            } catch (error) {
              // Continuar si ya existe
              console.warn('Tax rate already exists or error creating:', error);
            }
          }
        }

        // Importar almacenes
        if (configData.warehouses && Array.isArray(configData.warehouses)) {
          for (const warehouse of configData.warehouses) {
            try {
              await settingsService.createWarehouse(warehouse);
            } catch (error) {
              // Continuar si ya existe
              console.warn('Warehouse already exists or error creating:', error);
            }
          }
        }

        // Importar conceptos de nómina
        if (configData.payrollConcepts && Array.isArray(configData.payrollConcepts)) {
          for (const concept of configData.payrollConcepts) {
            try {
              await payrollSettingsService.createPayrollConcept(concept);
            } catch (error) {
              // Continuar si ya existe
              console.warn('Payroll concept already exists or error creating:', error);
            }
          }
        }

        setMessage({ 
          type: 'success', 
          text: `Configuración importada exitosamente. ${importedSections} secciones actualizadas.` 
        });
      } catch (error) {
        console.error('Error importing configuration:', error);
        let errorMessage = 'Error al importar la configuración.';
        
        if (error instanceof SyntaxError) {
          errorMessage = 'El archivo seleccionado no es un JSON válido.';
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }
        
        setMessage({ type: 'error', text: errorMessage });
      } finally {
        setLoading(false);
      }
    };
    input.click();
  };

  const handleResetConfiguration = async () => {
    if (!user?.id) {
      setMessage({ type: 'error', text: 'User not authenticated. Sign in to reset configuration.' });
      return;
    }
    setLoading(true);
    try {
      // Restablecer configuraciones a valores por defecto para República Dominicana
      const defaultAccountingSettings = {
        fiscal_year_start: '2024-01-01',
        fiscal_year_end: '2024-12-31',
        default_currency: 'DOP',
        decimal_places: 2,
        date_format: 'MM/DD/YYYY',
        number_format: '1,234.56',
        auto_backup: true,
        backup_frequency: 'daily',
        retention_period: 30
      };

      const defaultTaxSettings = {
        itbis_rate: 18.0,
        isr_rate: 27.0,
        retention_rate: 10.0,
        declaration_frequency: 'monthly',
        fiscal_year_start: '2024-01-01',
        fiscal_year_end: '2024-12-31'
      };

      const defaultInventorySettings = {
        valuation_method: 'FIFO',
        auto_reorder: false,
        track_serial_numbers: false,
        track_expiration_dates: false,
        default_warehouse: 'Principal'
      };

      const defaultPayrollSettings = {
        pay_frequency: 'monthly',
        overtime_rate: 1.5,
        social_security_rate: 2.87,
        afp_rate: 2.87,
        sfs_rate: 3.04,
        christmas_bonus: true,
        vacation_days: 14
      };

      await Promise.all([
        settingsService.saveAccountingSettings(defaultAccountingSettings, user.id),
        settingsService.saveTaxSettings(defaultTaxSettings),
        settingsService.saveInventorySettings(defaultInventorySettings),
        payrollSettingsService.savePayrollSettings(defaultPayrollSettings)
      ]);

      setMessage({ 
        type: 'success', 
        text: 'Configuration reset to Dominican Republic defaults' 
      });
      setShowResetModal(false);
    } catch (error) {
      console.error('Error resetting configuration:', error);
      setMessage({ 
        type: 'error', 
        text: 'Error resetting configuration' 
      });
    } finally {
      setLoading(false);
    }
  };

  const changeHistory: ChangeHistoryItem[] = [];

  // Auto-hide message after 5 seconds
  useState(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 bg-[#F8F3E7] min-h-full p-6">
        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            <div className="flex items-center">
              <i className={`${message.type === 'success' ? 'ri-check-circle-line' : 'ri-error-warning-line'} mr-2`}></i>
              {message.text}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-gradient-to-r from-[#3B4A2A] to-[#1F2616] rounded-2xl shadow-lg shadow-[#1F2616]/30 border border-[#2A351E] p-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">System Configuration</h1>
              <p className="text-[#CFE6AB] text-lg">
                Manage the overall configuration of your accounting system
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="ri-search-line text-white/60"></i>
                </div>
                <input
                  type="text"
                  placeholder="Search configuration..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-3 border-2 border-white/30 bg-white/10 text-white placeholder-white/60 rounded-lg focus:ring-2 focus:ring-white focus:border-white focus:bg-white/20 backdrop-blur-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {filteredSections.map((section) => {
            const isRestricted = !canAccessRoute(section.href);
            const requiredPlan = isRestricted ? getRequiredPlanForRoute(section.href) : '';

            if (isRestricted) {
              return (
                <div
                  key={section.id}
                  onClick={() => {
                    setRestrictedSectionName(section.name);
                    setRestrictedPlanName(requiredPlan);
                    setShowRestrictedModal(true);
                  }}
                  className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-8 hover:shadow-md transition-all cursor-pointer opacity-75 min-h-[200px]"
                >
                  <div className="flex flex-col h-full">
                    <div className="flex items-start space-x-4 mb-4">
                      <div className="flex-shrink-0">
                        <div className="w-16 h-16 bg-[#F0E8D7] rounded-xl flex items-center justify-center">
                          <i className={`${section.icon} text-[#A1A68B] text-3xl`}></i>
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xl font-bold text-[#7C8167]">
                            {section.name}
                          </h3>
                          <i className="ri-lock-2-fill text-[#C28A21] text-xl"></i>
                        </div>
                        <p className="text-sm text-gray-500 leading-relaxed">
                          {section.description}
                        </p>
                      </div>
                    </div>
                    <div className="mt-auto pt-4 border-t border-[#E9E2D1]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center text-sm text-[#C28A21] font-medium">
                          <i className="ri-vip-crown-2-line mr-2 text-lg"></i>
                          <span>Requires {requiredPlan}</span>
                        </div>
                        <button className="px-4 py-2 bg-[#F6E5C1] text-[#8A6514] rounded-lg text-sm font-medium hover:bg-[#EDDBB1] transition-colors">
                          View Plans
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={section.id}
                onClick={() => handleSectionClick(section.href)}
                className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-8 hover:shadow-lg hover:border-[#C6B383] transition-all cursor-pointer group min-h-[200px]"
              >
                <div className="flex flex-col h-full">
                  <div className="flex items-start space-x-4 mb-4">
                    <div className="flex-shrink-0">
                      <div className="w-16 h-16 bg-gradient-to-br from-[#F4F0E3] to-[#E8DFC7] rounded-xl flex items-center justify-center group-hover:from-[#ECE3CE] group-hover:to-[#E0D2B0] transition-all shadow-sm">
                        <i className={`${section.icon} text-[#3B4A2A] text-3xl`}></i>
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-[#1F2618] group-hover:text-[#3B4A2A] transition-colors mb-2">
                        {section.name}
                      </h3>
                      <p className="text-sm text-[#5B6844] leading-relaxed">
                        {section.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto pt-4 border-t border-[#E9E2D1] group-hover:border-[#C6B383]/60">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#7C8167] font-medium uppercase tracking-wide">Configuration module</span>
                      <div className="flex items-center text-sm text-[#566738] group-hover:text-[#384726] font-medium">
                        <span>Configure</span>
                        <i className="ri-arrow-right-line ml-2 group-hover:translate-x-1 transition-transform"></i>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* History Modal */}
        {showHistoryModal && changeHistory.length > 0 && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Historial de Cambios</h3>
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <div className="space-y-4">
                  {changeHistory.map((item) => (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <h4 className="font-medium text-gray-900">{item.section}</h4>
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              item.action === 'Creación' ? 'bg-green-100 text-green-800' :
                              item.action === 'Actualización' ? 'bg-blue-100 text-blue-800' :
                              'bg-orange-100 text-orange-800'
                            }`}>
                              {item.action}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{item.details}</p>
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                            <span>Por: {item.user}</span>
                            <span>{new Date(item.timestamp).toLocaleString('es-DO')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reset Confirmation Modal */}
        {showResetModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                    <i className="ri-alert-line text-orange-600"></i>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Confirmar Restablecimiento</h3>
                </div>
                <p className="text-gray-600 mb-6">
                  ¿Estás seguro de que deseas restablecer todas las configuraciones a sus valores por defecto de República Dominicana? 
                  Esta acción no se puede deshacer.
                </p>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowResetModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleResetConfiguration}
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Restableciendo...' : 'Restablecer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de módulo restringido */}
        {showRestrictedModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowRestrictedModal(false)}
            />
            <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-center">
                <div className="w-14 h-14 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-2 backdrop-blur-sm">
                  <i className="ri-lock-2-line text-3xl text-white"></i>
                </div>
                <h3 className="text-lg font-bold text-white">Módulo Premium</h3>
                <p className="text-amber-100 text-sm">Acceso restringido</p>
              </div>
              <div className="p-4">
                <div className="text-center mb-4">
                  <p className="text-gray-600 text-sm mb-3">
                    <span className="font-semibold text-gray-900">"{restrictedSectionName}"</span> no está disponible en tu plan actual.
                  </p>
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-100">
                    <div className="flex items-center justify-center mb-1">
                      <i className="ri-vip-crown-2-fill text-amber-500 text-xl mr-2"></i>
                      <span className="text-xs text-gray-600">Plan requerido:</span>
                    </div>
                    <p className="text-base font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                      {restrictedPlanName}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowRestrictedModal(false)}
                    className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      setShowRestrictedModal(false);
                      window.REACT_APP_NAVIGATE('/plans');
                    }}
                    className="flex-1 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium text-sm hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center justify-center"
                  >
                    <i className="ri-arrow-up-circle-line mr-1"></i>
                    Ver Planes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
