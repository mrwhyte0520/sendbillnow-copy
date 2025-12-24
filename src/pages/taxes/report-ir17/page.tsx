import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { taxService, settingsService } from '../../../services/database';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { exportToPdf } from '../../../utils/exportImportUtils';
import { formatMoney } from '../../../utils/numberFormat';

export default function ReportIR17Page() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [reportPeriod, setReportPeriod] = useState('');
  const [withholdingData, setWithholdingData] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);

  useEffect(() => {
    // Establecer el mes actual como período por defecto
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
        console.error('Error cargando información de la empresa para Reporte IR-17', error);
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
      const data = await taxService.generateReportIR17(selectedPeriod);
      setReportPeriod(selectedPeriod);
      setWithholdingData(data || []);
    } catch (error) {
      console.error('Error generating report IR-17:', error);
      alert('Error al generar el reporte IR-17');
    } finally {
      setGenerating(false);
    }
  };

  const exportToExcel = async () => {
    if (withholdingData.length === 0) return;

    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';

    const companyRnc =
      (companyInfo as any)?.rnc ||
      (companyInfo as any)?.tax_id ||
      '';

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Reporte IR-17');

    const headers = [
      { title: 'Sección', width: 15 },
      { title: 'Concepto', width: 40 },
      { title: 'Valor', width: 18 },
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
    titleCell.value = 'Reporte IR-17 - Retenciones ISR';
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
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
      cell.alignment = { vertical: 'middle' };
    });
    currentRow++;

    const dataRows = [
      { seccion: 'A', concepto: 'Total ISR retenido a empleados', valor: totalIsrEmpleados },
      { seccion: 'B', concepto: 'Total ISR retenido a proveedores/terceros', valor: totalIsrProveedores },
      { seccion: 'B', concepto: 'Total ITBIS retenido a proveedores/terceros', valor: totalItbisProveedores },
      { seccion: 'TOTAL', concepto: 'Total ISR', valor: totalIsrRetenido },
      { seccion: 'TOTAL', concepto: 'Total ITBIS', valor: totalItbisRetenido },
      { seccion: 'TOTAL', concepto: 'Total general a pagar DGII', valor: totalPagarDgii },
    ];

    for (const item of dataRows) {
      const dataRow = ws.getRow(currentRow);
      dataRow.getCell(1).value = item.seccion;
      dataRow.getCell(2).value = item.concepto;
      dataRow.getCell(3).value = item.valor;
      currentRow++;
    }

    headers.forEach((h, idx) => {
      ws.getColumn(idx + 1).width = h.width;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `reporte_ir17_${selectedPeriod}.xlsx`);
  };

  const exportToCSV = () => {
    if (withholdingData.length === 0) return;

    const separator = ';';

    const headers = [
      'Sección',
      'Concepto',
      'Valor'
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

    headerLines.push(['Reporte', 'Reporte IR-17 - Retenciones ISR'].join(separator));
    headerLines.push(['Período', reportPeriod || selectedPeriod].join(separator));
    headerLines.push('');

    const rows = [
      ['A', 'Total ISR retenido a empleados', formatMoney(totalIsrEmpleados, 'RD$')],
      ['B', 'Total ISR retenido a proveedores/terceros', formatMoney(totalIsrProveedores, 'RD$')],
      ['B', 'Total ITBIS retenido a proveedores/terceros', formatMoney(totalItbisProveedores, 'RD$')],
      ['TOTAL', 'Total ISR', formatMoney(totalIsrRetenido, 'RD$')],
      ['TOTAL', 'Total ITBIS', formatMoney(totalItbisRetenido, 'RD$')],
      ['TOTAL', 'Total general a pagar DGII', formatMoney(totalPagarDgii, 'RD$')],
    ];

    const csvContent = [
      ...headerLines,
      headers.join(separator),
      ...rows.map(r => r.join(separator)),
    ].join('\n');

    const csvForExcel = '\uFEFF' + csvContent.replace(/\n/g, '\r\n');
    const blob = new Blob([csvForExcel], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_ir17_${selectedPeriod}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToTXT = () => {
    if (withholdingData.length === 0) return;

    const periodLabel = reportPeriod || selectedPeriod;
    const periodCompact = String(periodLabel || '').replace('-', '');
    const lines = [
      `IR17|${periodCompact}`,
      `A|TOTAL_ISR_EMPLEADOS|${Number(totalIsrEmpleados).toFixed(2)}`,
      `B|TOTAL_ISR_PROVEEDORES|${Number(totalIsrProveedores).toFixed(2)}`,
      `B|TOTAL_ITBIS_PROVEEDORES|${Number(totalItbisProveedores).toFixed(2)}`,
      `T|TOTAL_ISR|${Number(totalIsrRetenido).toFixed(2)}`,
      `T|TOTAL_ITBIS|${Number(totalItbisRetenido).toFixed(2)}`,
      `T|TOTAL_PAGAR_DGII|${Number(totalPagarDgii).toFixed(2)}`,
    ];

    const txtContent = lines.join('\n');

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `reporte_ir17_${reportPeriod || selectedPeriod}.txt`;
    link.click();
  };

  const handleExportPdf = async () => {
    if (withholdingData.length === 0) return;

    try {
      const data = [
        { seccion: 'A', concepto: 'Total ISR retenido a empleados', valor: formatMoney(totalIsrEmpleados, 'RD$') },
        { seccion: 'B', concepto: 'Total ISR retenido a proveedores/terceros', valor: formatMoney(totalIsrProveedores, 'RD$') },
        { seccion: 'B', concepto: 'Total ITBIS retenido a proveedores/terceros', valor: formatMoney(totalItbisProveedores, 'RD$') },
        { seccion: 'TOTAL', concepto: 'Total ISR', valor: formatMoney(totalIsrRetenido, 'RD$') },
        { seccion: 'TOTAL', concepto: 'Total ITBIS', valor: formatMoney(totalItbisRetenido, 'RD$') },
        { seccion: 'TOTAL', concepto: 'Total general a pagar DGII', valor: formatMoney(totalPagarDgii, 'RD$') },
      ];

      const columns = [
        { key: 'seccion', label: 'Sección' },
        { key: 'concepto', label: 'Concepto' },
        { key: 'valor', label: 'Valor' },
      ];

      await exportToPdf(
        data,
        columns,
        `reporte_ir17_${selectedPeriod}`,
        'Reporte IR-17 - Retenciones ISR',
        'l',
      );
    } catch (error) {
      console.error('Error exporting Reporte IR-17 to PDF:', error);
      alert('Error al exportar a PDF. Revisa la consola para más detalles.');
    }
  };

  const employeesRows = withholdingData.filter((r: any) =>
    String(r?.beneficiary_type || '').toUpperCase() === 'EMPLEADO' ||
    String(r?.source || '').toLowerCase() === 'payroll'
  );

  const totalIsrEmpleados = employeesRows
    .filter((r: any) => String(r?.retention_type || '').toUpperCase() === 'ISR')
    .reduce((sum: number, r: any) => sum + (Number(r?.withheld_amount) || 0), 0);

  const supplierRows = withholdingData.filter((r: any) => !employeesRows.includes(r));

  const totalIsrProveedores = supplierRows
    .filter((r: any) => String(r?.retention_type || '').toUpperCase() === 'ISR')
    .reduce((sum: number, r: any) => sum + (Number(r?.withheld_amount) || 0), 0);

  const totalItbisProveedores = supplierRows
    .filter((r: any) => String(r?.retention_type || '').toUpperCase() === 'ITBIS')
    .reduce((sum: number, r: any) => sum + (Number(r?.withheld_amount) || 0), 0);

  const totalIsrRetenido = totalIsrEmpleados + totalIsrProveedores;
  const totalItbisRetenido = totalItbisProveedores;
  const totalPagarDgii = totalIsrRetenido + totalItbisRetenido;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reporte IR-17</h1>
            <p className="text-gray-600">Reporte de Retenciones de ISR</p>
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
                      <i className="ri-percent-line mr-2"></i>
                      Generar Reporte
                    </>
                  )}
                </button>
              </div>
            </div>
            {withholdingData.length > 0 && (
              <div className="flex space-x-2 flex-wrap">
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

        {/* Resumen DGII */}
        {withholdingData.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Resumen IR-17 (DGII) - {formatPeriodLabel(reportPeriod || selectedPeriod)}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Sección A (Empleados) / Sección B (Proveedores-Terceros) / Totales finales
              </p>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                  <div className="text-sm text-gray-600">Sección A — Empleados</div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-gray-800 font-medium">Total ISR retenido a empleados</div>
                    <div className="text-xl font-bold text-blue-700">{formatMoney(totalIsrEmpleados, 'RD$')}</div>
                  </div>
                </div>

                <div className="bg-orange-50 rounded-lg p-4 border border-orange-100">
                  <div className="text-sm text-gray-600">Sección B — Proveedores / Terceros</div>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-gray-800 font-medium">Total ISR retenido a proveedores</div>
                      <div className="text-xl font-bold text-orange-700">{formatMoney(totalIsrProveedores, 'RD$')}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-gray-800 font-medium">Total ITBIS retenido (30%)</div>
                      <div className="text-xl font-bold text-orange-700">{formatMoney(totalItbisProveedores, 'RD$')}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">Total ISR</div>
                  <div className="text-2xl font-bold text-gray-900">{formatMoney(totalIsrRetenido, 'RD$')}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">Total ITBIS</div>
                  <div className="text-2xl font-bold text-gray-900">{formatMoney(totalItbisRetenido, 'RD$')}</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="text-sm text-gray-600">Total general a pagar DGII</div>
                  <div className="text-2xl font-bold text-green-700">{formatMoney(totalPagarDgii, 'RD$')}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}