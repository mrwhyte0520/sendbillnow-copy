import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { taxService, settingsService } from '../../../services/database';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
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

  const exportToExcel = async () => {
    if (cancelledDocuments.length === 0) return;

    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';

    const companyRnc =
      (companyInfo as any)?.rnc ||
      (companyInfo as any)?.tax_id ||
      '';

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Reporte 608');

    const headers = [
      { title: 'NCF', width: 22 },
      { title: 'Tipo Documento', width: 16 },
      { title: 'Fecha Emisión', width: 14 },
      { title: 'Fecha Cancelación', width: 16 },
      { title: 'RNC Cliente', width: 15 },
      { title: 'Monto', width: 14 },
      { title: 'ITBIS', width: 14 },
      { title: 'Motivo', width: 30 },
    ];

    let currentRow = 1;
    const totalColumns = headers.length;

    ws.mergeCells(currentRow, 1, currentRow, totalColumns);
    const companyCell = ws.getCell(currentRow, 1);
    companyCell.value = companyName;
    companyCell.font = { bold: true, size: 14 };
    companyCell.alignment = { horizontal: 'left', vertical: 'middle' };
    currentRow++;

    if (companyRnc) {
      ws.mergeCells(currentRow, 1, currentRow, totalColumns);
      const rncCell = ws.getCell(currentRow, 1);
      rncCell.value = `RNC: ${companyRnc}`;
      rncCell.font = { bold: true };
      rncCell.alignment = { horizontal: 'left', vertical: 'middle' };
      currentRow++;
    }

    ws.mergeCells(currentRow, 1, currentRow, totalColumns);
    const titleCell = ws.getCell(currentRow, 1);
    titleCell.value = 'Reporte 608 - Documentos Cancelados';
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    currentRow++;

    ws.mergeCells(currentRow, 1, currentRow, totalColumns);
    const periodCell = ws.getCell(currentRow, 1);
    periodCell.value = `Período: ${reportPeriod || selectedPeriod}`;
    periodCell.alignment = { horizontal: 'left', vertical: 'middle' };
    currentRow++;
    currentRow++;

    const headerRow = ws.getRow(currentRow);
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h.title;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF008000' } };
      cell.alignment = { vertical: 'middle' };
    });
    currentRow++;

    for (const doc of cancelledDocuments) {
      const dataRow = ws.getRow(currentRow);
      dataRow.getCell(1).value = doc.ncf;
      dataRow.getCell(2).value = doc.document_type;
      dataRow.getCell(3).value = doc.issue_date;
      dataRow.getCell(4).value = doc.cancellation_date;
      dataRow.getCell(5).value = doc.customer_rnc;
      dataRow.getCell(6).value = doc.amount;
      dataRow.getCell(7).value = doc.tax_amount;
      dataRow.getCell(8).value = doc.reason;
      currentRow++;
    }

    headers.forEach((h, idx) => {
      ws.getColumn(idx + 1).width = h.width;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `reporte_608_${selectedPeriod}.xlsx`);
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
                    {formatMoney(totals.total_amount, '')}
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
                    {formatMoney(totals.total_tax, '')}
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
                      {formatMoney(doc.amount, '')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(doc.tax_amount, '')}
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
