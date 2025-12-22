import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { taxService, settingsService } from '../../../services/database';
import * as XLSX from 'xlsx';
import { exportToPdf } from '../../../utils/exportImportUtils';
import { formatMoney } from '../../../utils/numberFormat';

interface Report608Data {
  ncf: string;
  document_type: string;
  issue_date: string;
  cancellation_date: string;
  amount: number;
  tax_amount: number;
  reason: string;
  customer_rnc: string;
}

export default function Report608Page() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [reportPeriod, setReportPeriod] = useState('');
  const [cancelledDocuments, setCancelledDocuments] = useState<Report608Data[]>([]);
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
        console.error('Error cargando información de la empresa para Reporte 608', error);
      }
    };

    loadCompany();
  }, []);

  const formatPeriodLabel = (period: string) => {
    if (!period) return '';
    const [yearStr, monthStr] = period.split('-');
    const monthIndex = Number(monthStr) - 1;
    const months = [
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre'
    ];

    const monthName = months[monthIndex] || '';
    return monthName ? `${monthName} de ${yearStr}` : period;
  };

  const generateReport = async () => {
    if (!selectedPeriod) return;
    
    setGenerating(true);
    try {
      const data = await taxService.generateReport608(selectedPeriod);
      setReportPeriod(selectedPeriod);
      setCancelledDocuments(data);
    } catch (error) {
      console.error('Error generating report 608:', error);
      alert('Error al generar el reporte 608');
    } finally {
      setGenerating(false);
    }
  };

  const exportToExcel = () => {
    if (cancelledDocuments.length === 0) return;

    const excelData = cancelledDocuments.map(doc => ({
      'NCF': doc.ncf,
      'Tipo Documento': doc.document_type,
      'Fecha Emisión': doc.issue_date,
      'Fecha Cancelación': doc.cancellation_date,
      'RNC Cliente': doc.customer_rnc,
      'Monto': doc.amount,
      'ITBIS': doc.tax_amount,
      'Motivo': doc.reason
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
    headerRows.push(['Reporte 608 - Documentos Cancelados']);
    headerRows.push([`Período: ${reportPeriod || selectedPeriod}`]);
    headerRows.push([]);

    const wb = XLSX.utils.book_new();
    const tableStartRow = headerRows.length + 1;
    const ws = XLSX.utils.json_to_sheet(excelData as any, { origin: `A${tableStartRow}` } as any);

    ws['!cols'] = [
      { wch: 20 },
      { wch: 15 },
      { wch: 15 },
      { wch: 18 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 30 }
    ];

    XLSX.utils.sheet_add_aoa(ws, headerRows, { origin: 'A1' });

    XLSX.utils.book_append_sheet(wb, ws, 'Reporte 608');
    XLSX.writeFile(wb, `reporte_608_${selectedPeriod}.xlsx`);
  };

  const exportToCSV = () => {
    if (cancelledDocuments.length === 0) return;

    const separator = ';';

    const headers = [
      'NCF',
      'Tipo Documento',
      'Fecha Emisión',
      'Fecha Cancelación',
      'Monto',
      'ITBIS',
      'RNC Cliente',
      'Motivo'
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

    headerLines.push(['Reporte', 'Reporte 608 - Documentos Cancelados'].join(separator));
    headerLines.push(['Período', reportPeriod || selectedPeriod].join(separator));
    headerLines.push('');

    const csvContent = [
      ...headerLines,
      headers.join(separator),
      ...cancelledDocuments.map(doc => [
        doc.ncf,
        doc.document_type,
        doc.issue_date,
        doc.cancellation_date,
        doc.amount,
        doc.tax_amount,
        doc.customer_rnc,
        `"${doc.reason}"`
      ].join(separator))
    ].join('\n');

    const csvForExcel = '\uFEFF' + csvContent.replace(/\n/g, '\r\n');
    const blob = new Blob([csvForExcel], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_608_${selectedPeriod}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPdf = async () => {
    if (cancelledDocuments.length === 0) return;

    try {
      const data = cancelledDocuments.map(doc => ({
        ncf: doc.ncf,
        tipo: doc.document_type,
        fecha_emision: new Date(doc.issue_date).toLocaleDateString('es-DO'),
        fecha_cancelacion: new Date(doc.cancellation_date).toLocaleDateString('es-DO'),
        rnc_cliente: doc.customer_rnc,
        monto: doc.amount,
        itbis: doc.tax_amount,
      }));

      const columns = [
        { key: 'ncf', label: 'NCF' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'fecha_emision', label: 'Fecha Emisión' },
        { key: 'fecha_cancelacion', label: 'Fecha Cancelación' },
        { key: 'rnc_cliente', label: 'RNC Cliente' },
        { key: 'monto', label: 'Monto' },
        { key: 'itbis', label: 'ITBIS' },
      ];

      await exportToPdf(
        data,
        columns,
        `reporte_608_${selectedPeriod}`,
        'Reporte 608 - Documentos Cancelados',
        'p',
      );
    } catch (error) {
      console.error('Error exporting Reporte 608 to PDF:', error);
      alert('Error al exportar a PDF. Revisa la consola para más detalles.');
    }
  };

  const exportToTXT = () => {
    if (cancelledDocuments.length === 0) return;

    const toYyyymmdd = (dateStr: string) => {
      const d = String(dateStr || '').slice(0, 10);
      return d.replace(/-/g, '');
    };

    // TXT oficial DGII (608):
    // NUMERO_COMPROBANTE|FECHA_ANULACION|TIPO_ANULACION
    // Tipos de anulación (DGII): 01,02,03,04
    const txtContent = (cancelledDocuments || [])
      .map((doc) => {
        const ncf = String(doc.ncf || '').trim();
        const fechaAnulacion = toYyyymmdd(doc.cancellation_date);
        // Por defecto: 01 (Error de facturación). Si luego quieres mapear por doc.reason, lo hacemos.
        const tipoAnulacion = '01';
        return [ncf, fechaAnulacion, tipoAnulacion].join('|');
      })
      .join('\n');

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `DGII_608_${String(selectedPeriod || '').replace('-', '')}.TXT`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getTotals = () => {
    return cancelledDocuments.reduce((totals, doc) => ({
      total_amount: totals.total_amount + doc.amount,
      total_tax: totals.total_tax + doc.tax_amount,
      count: totals.count + 1
    }), {
      total_amount: 0,
      total_tax: 0,
      count: 0
    });
  };

  const totals = getTotals();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reporte 608</h1>
            <p className="text-gray-600">Reporte de Documentos Cancelados</p>
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
                      <i className="ri-file-damage-line mr-2"></i>
                      Generar Reporte
                    </>
                  )}
                </button>
              </div>
            </div>
            {cancelledDocuments.length > 0 && (
              <div className="flex space-x-2">
                <button
                  onClick={exportToExcel}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-file-excel-2-line mr-2"></i>
                  Exportar Excel
                </button>
                <button
                  onClick={exportToCSV}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-download-line mr-2"></i>
                  Exportar CSV
                </button>
                <button
                  onClick={exportToTXT}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap"
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
        {cancelledDocuments.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-red-100 mr-4">
                  <i className="ri-file-damage-line text-xl text-red-600"></i>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Documentos Cancelados</p>
                  <p className="text-2xl font-bold text-gray-900">{totals.count}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-orange-100 mr-4">
                  <i className="ri-money-dollar-circle-line text-xl text-orange-600"></i>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Monto Total Cancelado</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatMoney(totals.total_amount, 'RD$')}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-purple-100 mr-4">
                  <i className="ri-percent-line text-xl text-purple-600"></i>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">ITBIS Cancelado</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatMoney(totals.total_tax, 'RD$')}
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
              Detalle del Reporte 608 - {formatPeriodLabel(reportPeriod)}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    NCF
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha Emisión
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha Cancelación
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    RNC Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Monto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ITBIS
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Motivo
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {cancelledDocuments.map((doc, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {doc.ncf}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {doc.document_type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(doc.issue_date).toLocaleDateString('es-DO')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(doc.cancellation_date).toLocaleDateString('es-DO')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {doc.customer_rnc}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(doc.amount, 'RD$')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(doc.tax_amount, 'RD$')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {doc.reason}
                    </td>
                  </tr>
                ))}
                {cancelledDocuments.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
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
