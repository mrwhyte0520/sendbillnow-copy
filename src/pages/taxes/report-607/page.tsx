import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { taxService, settingsService } from '../../../services/database';
import * as XLSX from 'xlsx';
import { exportToPdf } from '../../../utils/exportImportUtils';
import { formatMoney } from '../../../utils/numberFormat';

interface Report607Data {
  rnc_cedula: string;
  tipo_identificacion: string;
  numero_comprobante_fiscal: string;
  fecha_comprobante: string;
  monto_facturado: number;
  itbis_facturado: number;
  itbis_retenido: number;
  monto_propina_legal: number;
  itbis_retenido_propina: number;
  itbis_percibido_ventas: number;
  retencion_renta_terceros: number;
  isr_percibido_ventas: number;
  impuesto_selectivo_consumo: number;
  otros_impuestos_tasas: number;
  monto_propina_legal_2: number;
}

const periodToLocalDate = (period: string) => {
  const parts = String(period || '').split('-');
  const year = Number(parts[0]) || 0;
  const month = Number(parts[1]) || 0;
  if (!year || !month) return new Date();
  return new Date(year, month - 1, 1);
};

export default function Report607Page() {
  const navigate = useNavigate();
  const [reportData, setReportData] = useState<Report607Data[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [generating, setGenerating] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);

  useEffect(() => {
    // Set current month as default
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    setSelectedPeriod(currentPeriod);
  }, []);

  useEffect(() => {
    const loadCompany = async () => {
      try {
        const info = await settingsService.getCompanyInfo();
        setCompanyInfo(info);
      } catch (error) {
        console.error('Error cargando información de la empresa para Reporte 607', error);
      }
    };

    loadCompany();
  }, []);

  const generateReport = async () => {
    if (!selectedPeriod) return;
    
    setGenerating(true);
    try {
      const data = await taxService.generateReport607(selectedPeriod);
      setReportData(data);
    } catch (error) {
      console.error('Error generating report 607:', error);
      alert('Error al generar el reporte 607');
    } finally {
      setGenerating(false);
    }
  };

  const exportToCSV = () => {
    if (reportData.length === 0) return;

    const separator = ';';

    const headers = [
      'RNC/Cédula',
      'Tipo ID',
      'NCF',
      'Fecha Comprobante',
      'Monto Facturado',
      'ITBIS Facturado',
      'ITBIS Retenido',
      'Propina Legal',
      'ITBIS Ret. Propina',
      'ITBIS Percibido',
      'Retención Terceros',
      'ISR Percibido',
      'Imp. Selectivo',
      'Otros Impuestos',
      'Propina Legal 2'
    ];

    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';

    const companyRnc =
      (companyInfo as any)?.rnc ||
      (companyInfo as any)?.tax_id ||
      '';

    const headerLines: string[] = [
      ['Empresa', companyName].join(separator),
    ];

    if (companyRnc) {
      headerLines.push(['RNC', companyRnc].join(separator));
    }

    headerLines.push(['Reporte', 'Reporte 607 - Ventas y Servicios'].join(separator));
    headerLines.push(['Período', selectedPeriod].join(separator));
    headerLines.push('');

    const csvContent = [
      ...headerLines,
      headers.join(separator),
      ...reportData.map(row => [
        row.rnc_cedula,
        row.tipo_identificacion,
        row.numero_comprobante_fiscal,
        row.fecha_comprobante,
        formatMoney(row.monto_facturado, 'RD$'),
        formatMoney(row.itbis_facturado, 'RD$'),
        formatMoney(row.itbis_retenido, 'RD$'),
        formatMoney(row.monto_propina_legal, 'RD$'),
        formatMoney(row.itbis_retenido_propina, 'RD$'),
        formatMoney(row.itbis_percibido_ventas, 'RD$'),
        formatMoney(row.retencion_renta_terceros, 'RD$'),
        formatMoney(row.isr_percibido_ventas, 'RD$'),
        formatMoney(row.impuesto_selectivo_consumo, 'RD$'),
        formatMoney(row.otros_impuestos_tasas, 'RD$'),
        formatMoney(row.monto_propina_legal_2, 'RD$')
      ].join(separator))
    ].join('\n');

    const csvForExcel = '\uFEFF' + csvContent.replace(/\n/g, '\r\n');
    const blob = new Blob([csvForExcel], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_607_${selectedPeriod}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToExcel = () => {
    if (reportData.length === 0) return;

    const excelData = reportData.map(row => ({
      'RNC/Cédula': row.rnc_cedula,
      'Tipo Identificación': row.tipo_identificacion,
      'NCF': row.numero_comprobante_fiscal,
      'Fecha Comprobante': row.fecha_comprobante,
      'Monto Facturado': formatMoney(row.monto_facturado, 'RD$'),
      'ITBIS Facturado': formatMoney(row.itbis_facturado, 'RD$'),
      'ITBIS Retenido': formatMoney(row.itbis_retenido, 'RD$'),
      'Propina Legal': formatMoney(row.monto_propina_legal, 'RD$'),
      'ITBIS Ret. Propina': formatMoney(row.itbis_retenido_propina, 'RD$'),
      'ITBIS Percibido Ventas': formatMoney(row.itbis_percibido_ventas, 'RD$'),
      'Retención Renta Terceros': formatMoney(row.retencion_renta_terceros, 'RD$'),
      'ISR Percibido Ventas': formatMoney(row.isr_percibido_ventas, 'RD$'),
      'Impuesto Selectivo Consumo': formatMoney(row.impuesto_selectivo_consumo, 'RD$'),
      'Otros Impuestos/Tasas': formatMoney(row.otros_impuestos_tasas, 'RD$'),
      'Propina Legal 2': formatMoney(row.monto_propina_legal_2, 'RD$'),
    }));

    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';

    const companyRnc =
      (companyInfo as any)?.rnc ||
      (companyInfo as any)?.tax_id ||
      '';

    const headerRows: (string | number)[][] = [];

    headerRows.push([companyName]);
    if (companyRnc) {
      headerRows.push([`RNC: ${companyRnc}`]);
    }
    headerRows.push(['Reporte 607 - Ventas y Servicios']);
    headerRows.push([`Período: ${selectedPeriod}`]);
    headerRows.push([]);

    const wb = XLSX.utils.book_new();

    const colWidths = [
      { wch: 15 }, // RNC/Cédula
      { wch: 16 }, // Tipo Identificación
      { wch: 18 }, // NCF
      { wch: 16 }, // Fecha
      { wch: 18 }, // Monto Facturado
      { wch: 18 }, // ITBIS Facturado
      { wch: 18 }, // ITBIS Retenido
      { wch: 16 }, // Propina Legal
      { wch: 18 }, // ITBIS Ret. Propina
      { wch: 20 }, // ITBIS Percibido Ventas
      { wch: 24 }, // Retención Renta Terceros
      { wch: 20 }, // ISR Percibido Ventas
      { wch: 24 }, // Impuesto Selectivo Consumo
      { wch: 22 }, // Otros Impuestos/Tasas
      { wch: 18 }, // Propina Legal 2
    ];
    const tableStartRow = headerRows.length + 1;
    const ws = XLSX.utils.json_to_sheet(excelData as any, { origin: `A${tableStartRow}` } as any);
    (ws as any)['!cols'] = colWidths;

    XLSX.utils.sheet_add_aoa(ws, headerRows, { origin: 'A1' });

    XLSX.utils.book_append_sheet(wb, ws, 'Reporte 607');
    XLSX.writeFile(wb, `reporte_607_${selectedPeriod}.xlsx`);
  };

  const exportToTXT = () => {
    if (reportData.length === 0) return;

    const toYyyymmdd = (dateStr: string) => {
      const d = String(dateStr || '').slice(0, 10);
      return d.replace(/-/g, '');
    };
    const toMoney = (n: any) => {
      const val = Number(n) || 0;
      return val.toFixed(2);
    };
    const toTipoId = (rncOrCed: string) => {
      const digits = String(rncOrCed || '').replace(/[^0-9]/g, '');
      // DGII: 1=RNC, 2=Cédula
      return digits.length === 11 ? '2' : '1';
    };

    // TXT oficial DGII (607): sin encabezados, una línea por registro
    // Estructura:
    // RNC_CEDULA|TIPO_ID|NUMERO_COMPROBANTE|NUMERO_COMPROBANTE_MODIFICADO|TIPO_INGRESO|FECHA_COMPROBANTE|FECHA_RETENCION|MONTO_FACTURADO|ITBIS_FACTURADO|ITBIS_RETENIDO|ITBIS_PERCIBIDO|RETENCION_RENTA|ISR_PERCIBIDO|IMPUESTO_SELECTIVO_CONSUMO|OTROS_IMPUESTOS_TASAS|MONTO_PROPINA_LEGAL
    const txtContent = (reportData || [])
      .map((row) => {
        const rnc = String(row.rnc_cedula || '').trim();
        const tipoId = toTipoId(rnc);
        const ncf = String(row.numero_comprobante_fiscal || '').trim();
        const ncfMod = '';
        const tipoIngreso = '01';
        const fechaComp = toYyyymmdd(row.fecha_comprobante);
        const fechaRet = '';

        const montoFact = toMoney(row.monto_facturado);
        const itbisFact = toMoney(row.itbis_facturado);
        const itbisRet = toMoney(row.itbis_retenido);
        const itbisPerc = toMoney(row.itbis_percibido_ventas);
        const retRenta = toMoney(row.retencion_renta_terceros);
        const isrPerc = toMoney(row.isr_percibido_ventas);
        const isc = toMoney(row.impuesto_selectivo_consumo);
        const otros = toMoney(row.otros_impuestos_tasas);
        const propina = toMoney(row.monto_propina_legal);

        return [
          rnc,
          tipoId,
          ncf,
          ncfMod,
          tipoIngreso,
          fechaComp,
          fechaRet,
          montoFact,
          itbisFact,
          itbisRet,
          itbisPerc,
          retRenta,
          isrPerc,
          isc,
          otros,
          propina,
        ].join('|');
      })
      .join('\n');

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `DGII_607_${String(selectedPeriod || '').replace('-', '')}.TXT`;
    link.click();
  };

  const handleExportPdf = async () => {
    if (reportData.length === 0) return;

    try {
      const data = reportData.map(row => ({
        rnc_cedula: row.rnc_cedula,
        ncf: row.numero_comprobante_fiscal,
        fecha: new Date(row.fecha_comprobante).toLocaleDateString('es-DO'),
        monto_facturado: formatMoney(row.monto_facturado, 'RD$'),
        itbis_facturado: formatMoney(row.itbis_facturado, 'RD$'),
        itbis_retenido: formatMoney(row.itbis_retenido, 'RD$'),
        isr_retenido: formatMoney(row.retencion_renta_terceros, 'RD$'),
      }));

      const columns = [
        { key: 'rnc_cedula', label: 'RNC/Cédula' },
        { key: 'ncf', label: 'NCF' },
        { key: 'fecha', label: 'F. Comp.' },
        { key: 'monto_facturado', label: 'Monto Fact.' },
        { key: 'itbis_facturado', label: 'ITBIS Fact.' },
        { key: 'itbis_retenido', label: 'ITBIS Ret.' },
        { key: 'isr_retenido', label: 'ISR Ret.' },
      ];

      await exportToPdf(
        data,
        columns,
        `reporte_607_${selectedPeriod}`,
        'Reporte 607 - Ventas y Servicios',
        'p',
      );
    } catch (error) {
      console.error('Error exporting Reporte 607 to PDF:', error);
      alert('Error al exportar a PDF. Revisa la consola para más detalles.');
    }
  };

  const getTotals = () => {
    return reportData.reduce((totals, row) => ({
      monto_facturado: totals.monto_facturado + row.monto_facturado,
      itbis_facturado: totals.itbis_facturado + row.itbis_facturado,
      itbis_retenido: totals.itbis_retenido + row.itbis_retenido,
      retencion_renta_terceros: totals.retencion_renta_terceros + row.retencion_renta_terceros
    }), {
      monto_facturado: 0,
      itbis_facturado: 0,
      itbis_retenido: 0,
      retencion_renta_terceros: 0
    });
  };

  const totals = getTotals();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reporte 607</h1>
            <p className="text-gray-600">Reporte de Ventas y Servicios</p>
          </div>
          <button
            onClick={() => navigate('/taxes')}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-arrow-left-line mr-2"></i>
            Volver a Impuestos
          </button>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Período
                </label>
                <input
                  type="month"
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="pt-6">
                <button
                  onClick={generateReport}
                  disabled={generating || !selectedPeriod}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {generating ? (
                    <>
                      <i className="ri-loader-4-line animate-spin mr-2"></i>
                      Generando...
                    </>
                  ) : (
                    <>
                      <i className="ri-file-chart-2-line mr-2"></i>
                      Generar Reporte
                    </>
                  )}
                </button>
              </div>
            </div>
            {reportData.length > 0 && (
              <div className="flex gap-3 mt-6 md:mt-8 flex-wrap">
                <button
                  onClick={exportToCSV}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-file-text-line mr-2"></i>
                  Exportar CSV
                </button>
                <button
                  onClick={exportToExcel}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-file-excel-line mr-2"></i>
                  Exportar Excel
                </button>
                <button
                  onClick={exportToTXT}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-file-text-line mr-2"></i>
                  Exportar TXT
                </button>
                <button
                  onClick={handleExportPdf}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-file-pdf-line mr-2"></i>
                  Exportar PDF
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        {reportData.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-blue-100 mr-4">
                  <i className="ri-money-dollar-circle-line text-xl text-blue-600"></i>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Vendido</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatMoney(totals.monto_facturado, 'RD$')}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-green-100 mr-4">
                  <i className="ri-percent-line text-xl text-green-600"></i>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">ITBIS Cobrado</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatMoney(totals.itbis_facturado, 'RD$')}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-orange-100 mr-4">
                  <i className="ri-subtract-line text-xl text-orange-600"></i>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">ITBIS Retenido</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatMoney(totals.itbis_retenido, 'RD$')}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-purple-100 mr-4">
                  <i className="ri-calculator-line text-xl text-purple-600"></i>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">ISR Retenido</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatMoney(totals.retencion_renta_terceros, 'RD$')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Report Data */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Detalle del Reporte 607 - {selectedPeriod && periodToLocalDate(selectedPeriod).toLocaleDateString('es-DO', { year: 'numeric', month: 'long' })}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    RNC/Cédula
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    NCF
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Monto Facturado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ITBIS Facturado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ITBIS Retenido
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ISR Retenido
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reportData.map((row, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {row.rnc_cedula}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {row.numero_comprobante_fiscal}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(row.fecha_comprobante).toLocaleDateString('es-DO')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(row.monto_facturado, 'RD$')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(row.itbis_facturado, 'RD$')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(row.itbis_retenido, 'RD$')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(row.retencion_renta_terceros, 'RD$')}
                    </td>
                  </tr>
                ))}
                {reportData.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                      {generating ? 'Generando reporte...' : 'No hay datos para mostrar. Seleccione un período y genere el reporte.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}