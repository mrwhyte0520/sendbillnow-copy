import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { taxService, settingsService } from '../../../services/database';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { exportToPdf } from '../../../utils/exportImportUtils';
import { formatMoney } from '../../../utils/numberFormat';

interface Report623Data {
  beneficiary_name: string;
  beneficiary_country: string;
  payment_concept: string;
  payment_date: string;
  amount_usd: number;
  amount_dop: number;
  exchange_rate: number;
  tax_withheld: number;
  payment_method: string;
}

export default function Report623Page() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [foreignPayments, setForeignPayments] = useState<Report623Data[]>([]);
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
        console.error('Error cargando información de la empresa para Reporte 623', error);
      }
    };

    loadCompany();
  }, []);

  const generateReport = async () => {
    if (!selectedPeriod) return;
    
    setGenerating(true);
    try {
      const data = await taxService.generateReport623(selectedPeriod);
      setForeignPayments(data);
    } catch (error) {
      console.error('Error generating report 623:', error);
      alert('Error al generar el reporte 623');
    } finally {
      setGenerating(false);
    }
  };

  const exportToExcel = async () => {
    if (foreignPayments.length === 0) return;

    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';

    const companyRnc =
      (companyInfo as any)?.rnc ||
      (companyInfo as any)?.tax_id ||
      '';

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Reporte 623');

    const headers = [
      { title: 'Beneficiario', width: 30 },
      { title: 'País', width: 15 },
      { title: 'Concepto', width: 25 },
      { title: 'Fecha Pago', width: 14 },
      { title: 'Método Pago', width: 16 },
      { title: 'Monto USD', width: 14 },
      { title: 'Monto ', width: 14 },
      { title: 'Tasa Cambio', width: 14 },
      { title: 'Impuesto', width: 14 },
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
    titleCell.value = 'Reporte 623 - Pagos al Exterior';
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    currentRow++;

    ws.mergeCells(currentRow, 1, currentRow, totalColumns);
    const periodCell = ws.getCell(currentRow, 1);
    periodCell.value = `Período: ${selectedPeriod}`;
    periodCell.alignment = { horizontal: 'left', vertical: 'middle' };
    currentRow++;
    currentRow++;

    const headerRow = ws.getRow(currentRow);
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h.title;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
      cell.alignment = { vertical: 'middle' };
    });
    currentRow++;

    for (const payment of foreignPayments) {
      const dataRow = ws.getRow(currentRow);
      dataRow.getCell(1).value = payment.beneficiary_name;
      dataRow.getCell(2).value = payment.beneficiary_country;
      dataRow.getCell(3).value = payment.payment_concept;
      dataRow.getCell(4).value = payment.payment_date;
      dataRow.getCell(5).value = payment.payment_method;
      dataRow.getCell(6).value = payment.amount_usd;
      dataRow.getCell(7).value = payment.amount_dop;
      dataRow.getCell(8).value = payment.exchange_rate;
      dataRow.getCell(9).value = payment.tax_withheld;
      currentRow++;
    }

    headers.forEach((h, idx) => {
      ws.getColumn(idx + 1).width = h.width;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `reporte_623_${selectedPeriod}.xlsx`);
  };

  const exportToCSV = () => {
    if (foreignPayments.length === 0) return;

    const separator = ';';

    const headers = [
      'Beneficiario',
      'País',
      'Concepto',
      'Fecha Pago',
      'Monto USD',
      'Monto ',
      'Tasa Cambio',
      'Impuesto Retenido',
      'Método Pago'
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

    headerLines.push(['Reporte', 'Reporte 623 - Pagos al Exterior'].join(separator));
    headerLines.push(['Período', selectedPeriod].join(separator));
    headerLines.push('');

    const csvContent = [
      ...headerLines,
      headers.join(separator),
      ...foreignPayments.map(payment => [
        `"${payment.beneficiary_name}"`,
        `"${payment.beneficiary_country}"`,
        `"${payment.payment_concept}"`,
        payment.payment_date,
        payment.amount_usd,
        payment.amount_dop,
        payment.exchange_rate,
        payment.tax_withheld,
        `"${payment.payment_method}"`
      ].join(separator))
    ].join('\n');

    const csvForExcel = '\uFEFF' + csvContent.replace(/\n/g, '\r\n');
    const blob = new Blob([csvForExcel], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_623_${selectedPeriod}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPdf = async () => {
    if (foreignPayments.length === 0) return;

    try {
      const data = foreignPayments.map(payment => ({
        beneficiario: payment.beneficiary_name,
        pais: payment.beneficiary_country,
        concepto: payment.payment_concept,
        fecha: new Date(payment.payment_date).toLocaleDateString('es-DO'),
        monto_usd: payment.amount_usd,
        monto_dop: payment.amount_dop,
        tasa: payment.exchange_rate,
        impuesto: payment.tax_withheld,
      }));

      const columns = [
        { key: 'beneficiario', label: 'Beneficiario' },
        { key: 'pais', label: 'País' },
        { key: 'concepto', label: 'Concepto' },
        { key: 'fecha', label: 'Fecha' },
        { key: 'monto_usd', label: 'Monto USD' },
        { key: 'monto_dop', label: 'Monto ' },
        { key: 'tasa', label: 'Tasa' },
        { key: 'impuesto', label: 'Impuesto' },
      ];

      await exportToPdf(
        data,
        columns,
        `reporte_623_${selectedPeriod}`,
        'Reporte 623 - Pagos al Exterior',
        'l',
      );
    } catch (error) {
      console.error('Error exporting Reporte 623 to PDF:', error);
      alert('Error al exportar a PDF. Revisa la consola para más detalles.');
    }
  };

  const exportToTXT = () => {
    if (foreignPayments.length === 0) return;

    const txtContent = foreignPayments.map(payment => [
      payment.beneficiary_name,
      payment.beneficiary_country,
      payment.payment_concept,
      payment.payment_date,
      payment.amount_usd,
      payment.amount_dop,
      payment.exchange_rate,
      payment.tax_withheld,
      payment.payment_method
    ].join('|')).join('\n');

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_623_${selectedPeriod}.txt`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getTotals = () => {
    return foreignPayments.reduce((totals, payment) => ({
      total_usd: totals.total_usd + payment.amount_usd,
      total_dop: totals.total_dop + payment.amount_dop,
      total_tax: totals.total_tax + payment.tax_withheld,
      count: totals.count + 1
    }), {
      total_usd: 0,
      total_dop: 0,
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
            <h1 className="text-2xl font-bold text-gray-900">Reporte 623</h1>
            <p className="text-gray-600">Reporte de Pagos al Exterior</p>
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
                      <i className="ri-global-line mr-2"></i>
                      Generar Reporte
                    </>
                  )}
                </button>
              </div>
            </div>
            {foreignPayments.length > 0 && (
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
        {foreignPayments.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-blue-100 mr-4">
                  <i className="ri-global-line text-xl text-blue-600"></i>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Pagos Realizados</p>
                  <p className="text-2xl font-bold text-gray-900">{totals.count}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-green-100 mr-4">
                  <i className="ri-money-dollar-circle-line text-xl text-green-600"></i>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Total USD</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatMoney(totals.total_usd)}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-orange-100 mr-4">
                  <i className="ri-money-peso-circle-line text-xl text-orange-600"></i>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Total </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatMoney(totals.total_dop, '')}
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
                  <p className="text-sm font-medium text-gray-600">Impuesto Retenido</p>
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
              Detalle del Reporte 623 - {selectedPeriod && new Date(selectedPeriod + '-01').toLocaleDateString('es-DO', { year: 'numeric', month: 'long' })}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Beneficiario
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    País
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Concepto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Monto USD
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Monto 
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tasa
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Impuesto
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {foreignPayments.map((payment, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {payment.beneficiary_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payment.beneficiary_country}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payment.payment_concept}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(payment.payment_date).toLocaleDateString('es-DO')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(payment.amount_usd)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(payment.amount_dop, '')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payment.exchange_rate}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(payment.tax_withheld, '')}
                    </td>
                  </tr>
                ))}
                {foreignPayments.length === 0 && (
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
