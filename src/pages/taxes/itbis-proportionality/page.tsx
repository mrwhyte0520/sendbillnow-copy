import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { taxService, settingsService } from '../../../services/database';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatMoney } from '../../../utils/numberFormat';

interface ItbisProportionalityData {
  period: string;
  totalSales: number;
  taxableSales: number;
  exemptSales: number;
  exemptDestinationSales: number;
  exportSales: number;
  creditNotesLess30Days: number;
  coefficient: number;
  nonAdmittedProportionality: number;
  itbisSubject: number;
  itbisDeductible: number;
}

export default function ItbisProportionalityPage() {
  const navigate = useNavigate();
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [data, setData] = useState<ItbisProportionalityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);

  const months = [
    { value: '01', label: 'Enero' },
    { value: '02', label: 'Febrero' },
    { value: '03', label: 'Marzo' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Mayo' },
    { value: '06', label: 'Junio' },
    { value: '07', label: 'Julio' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Septiembre' },
    { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' },
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, idx) => String(currentYear - idx));

  useEffect(() => {
    const loadCompany = async () => {
      try {
        const info = await settingsService.getCompanyInfo();
        setCompanyInfo(info);
      } catch (error) {
        console.error('Error cargando información de la empresa para Proporcionalidad ITBIS', error);
      }
    };

    loadCompany();
  }, []);

  const formatCurrency = (value: number) => {
    return formatMoney(Number(value || 0));
  };

  const formatPercent = (value: number) => {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
  };

  const getMonthLabel = (period: string) => {
    if (!period) return '';
    const [yearStr, monthStr] = period.split('-');
    const monthIndex = Number(monthStr) - 1;
    const monthName = months[monthIndex]?.label || '';
    return monthName ? `${monthName} ${yearStr}` : period;
  };

  const handleGenerate = async () => {
    if (!selectedYear || !selectedMonth) {
      alert('Por favor selecciona mes y año');
      return;
    }

    const period = `${selectedYear}-${selectedMonth}`;
    setLoading(true);

    try {
      const result = await taxService.getItbisProportionality(period);
      if (result) {
        setData(result);
        setShowResults(true);
      } else {
        alert('No se pudo generar el reporte');
      }
    } catch (error) {
      console.error('Error generating proportionality report:', error);
      alert('Error al generar el reporte');
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = async () => {
    if (!data) return;

    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';

    const companyRnc =
      (companyInfo as any)?.rnc ||
      (companyInfo as any)?.tax_id ||
      '';

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Proporcionalidad ITBIS');

    const headers = [
      { title: 'Concepto', width: 45 },
      { title: 'Valor', width: 22 },
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
    titleCell.value = 'Proporcionalidad del ITBIS';
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    currentRow++;

    ws.mergeCells(currentRow, 1, currentRow, totalColumns);
    const periodCell = ws.getCell(currentRow, 1);
    periodCell.value = `Período: ${getMonthLabel(data.period)}`;
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
      ['Período', getMonthLabel(data.period)],
      ['', ''],
      ['VENTAS DEL PERÍODO', ''],
      ['Total de las Ventas', data.totalSales],
      ['Ventas Gravadas', data.taxableSales],
      ['Ventas Exentas', data.exemptSales],
      ['Ventas Exentas por Destino', data.exemptDestinationSales],
      ['Ventas al Exterior', data.exportSales],
      ['Notas de Crédito < 30 Días', data.creditNotesLess30Days],
      ['', ''],
      ['CÁLCULO DE PROPORCIONALIDAD', ''],
      ['Coeficiente de Proporcionalidad', (data.coefficient * 100).toFixed(2) + '%'],
      ['ITBIS Sujeto a Proporcionalidad', data.itbisSubject],
      ['', ''],
      ['RESULTADOS', ''],
      ['ITBIS Deducible', data.itbisDeductible],
      ['Proporcionalidad No Admitida', data.nonAdmittedProportionality],
    ];

    for (const [concepto, valor] of dataRows) {
      const dataRow = ws.getRow(currentRow);
      dataRow.getCell(1).value = concepto;
      dataRow.getCell(2).value = valor;
      currentRow++;
    }

    headers.forEach((h, idx) => {
      ws.getColumn(idx + 1).width = h.width;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `proporcionalidad_itbis_${data.period}.xlsx`);
  };

  const exportToPDF = () => {
    if (!data) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';

    const companyRnc =
      (companyInfo as any)?.rnc ||
      (companyInfo as any)?.tax_id ||
      '';

    // Encabezado con nombre de la empresa
    doc.setFontSize(18);
    doc.text(companyName, pageWidth / 2, 18, { align: 'center' } as any);

    if (companyRnc) {
      doc.setFontSize(10);
      doc.text(`RNC: ${companyRnc}`, pageWidth / 2, 24, { align: 'center' } as any);
    }

    // Título del reporte
    const titleY = companyRnc ? 32 : 28;
    doc.setFontSize(14);
    doc.text('Proporcionalidad del ITBIS', pageWidth / 2, titleY, { align: 'center' } as any);

    doc.setFontSize(12);
    doc.text(`Período: ${getMonthLabel(data.period)}`, 14, titleY + 10);
    
    // Ventas del Período
    doc.setFontSize(14);
    doc.text('Ventas del Período', 14, 50);
    
    (doc as any).autoTable({
      startY: 55,
      head: [['Concepto', 'Valor']],
      body: [
        ['Total de las Ventas', formatCurrency(data.totalSales)],
        ['Ventas Gravadas', formatCurrency(data.taxableSales)],
        ['Ventas Exentas', formatCurrency(data.exemptSales)],
        ['Ventas Exentas por Destino', formatCurrency(data.exemptDestinationSales)],
        ['Ventas al Exterior', formatCurrency(data.exportSales)],
        ['Notas de Crédito < 30 Días', formatCurrency(data.creditNotesLess30Days)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
    });

    // Cálculo de Proporcionalidad
    const finalY1 = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.text('Cálculo de Proporcionalidad', 14, finalY1);
    
    (doc as any).autoTable({
      startY: finalY1 + 5,
      head: [['Concepto', 'Valor']],
      body: [
        ['Coeficiente de Proporcionalidad', formatPercent(data.coefficient)],
        ['ITBIS Sujeto a Proporcionalidad', formatCurrency(data.itbisSubject)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
    });

    // Resultados
    const finalY2 = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.text('Resultados', 14, finalY2);
    
    (doc as any).autoTable({
      startY: finalY2 + 5,
      head: [['Concepto', 'Valor']],
      body: [
        ['ITBIS Deducible', formatCurrency(data.itbisDeductible)],
        ['Proporcionalidad No Admitida', formatCurrency(data.nonAdmittedProportionality)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [34, 197, 94] },
      bodyStyles: { fontSize: 12, fontStyle: 'bold' },
    });

    // Nota al pie
    const finalY3 = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(9);
    doc.setTextColor(100);
    const noteText = 'Nota: Este cálculo es indicativo y debe validarse según las operaciones específicas de su empresa y las normativas de la DGII.';
    const splitNote = doc.splitTextToSize(noteText, 180);
    doc.text(splitNote, 14, finalY3);

    doc.save(`proporcionalidad_itbis_${data.period}.pdf`);
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Proporcionalidad del ITBIS</h1>
              <p className="text-gray-600">Cálculo mensual de la proporcionalidad del ITBIS deducible</p>
            </div>
            <button
              onClick={() => navigate('/taxes')}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              <i className="ri-arrow-left-line mr-2"></i>
              Volver
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Seleccionar Período</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Año
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mes
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || !selectedYear || !selectedMonth}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Calculando...' : 'Calcular Proporcionalidad'}
          </button>
        </div>

        {/* Resultados */}
        {showResults && data && (
          <>
            {/* Título del Período y Botones de Exportación */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  Período: {getMonthLabel(data.period)}
                </h2>
                <div className="flex gap-3">
                  <button
                    onClick={exportToExcel}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                  >
                    <i className="ri-file-excel-2-line"></i>
                    Exportar Excel
                  </button>
                  <button
                    onClick={exportToPDF}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                  >
                    <i className="ri-file-pdf-line"></i>
                    Exportar PDF
                  </button>
                </div>
              </div>
            </div>

            {/* Ventas */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Ventas del Período</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Total de las Ventas</div>
                  <div className="text-xl font-bold text-blue-600">
                    {formatCurrency(data.totalSales)}
                  </div>
                </div>

                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Ventas Gravadas</div>
                  <div className="text-xl font-bold text-green-600">
                    {formatCurrency(data.taxableSales)}
                  </div>
                </div>

                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Ventas Exentas</div>
                  <div className="text-xl font-bold text-yellow-600">
                    {formatCurrency(data.exemptSales)}
                  </div>
                </div>

                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Ventas Exentas por Destino</div>
                  <div className="text-xl font-bold text-purple-600">
                    {formatCurrency(data.exemptDestinationSales)}
                  </div>
                </div>

                <div className="bg-indigo-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Ventas al Exterior</div>
                  <div className="text-xl font-bold text-indigo-600">
                    {formatCurrency(data.exportSales)}
                  </div>
                </div>

                <div className="bg-pink-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Notas de Crédito {'<'} 30 Días</div>
                  <div className="text-xl font-bold text-pink-600">
                    {formatCurrency(data.creditNotesLess30Days)}
                  </div>
                </div>
              </div>
            </div>

            {/* Cálculo de Proporcionalidad */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Cálculo de Proporcionalidad</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-teal-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Coeficiente de Proporcionalidad</div>
                  <div className="text-2xl font-bold text-teal-600">
                    {formatPercent(data.coefficient)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    (Ventas Gravadas / Total Ventas ajustadas)
                  </div>
                </div>

                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">ITBIS Sujeto a Proporcionalidad</div>
                  <div className="text-2xl font-bold text-orange-600">
                    {formatCurrency(data.itbisSubject)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    (ITBIS de Compras del período)
                  </div>
                </div>
              </div>
            </div>

            {/* Resultados Finales */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Resultados</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-green-50 p-6 rounded-lg border-2 border-green-200">
                  <div className="text-sm text-gray-600 mb-2">ITBIS Deducible</div>
                  <div className="text-3xl font-bold text-green-600">
                    {formatCurrency(data.itbisDeductible)}
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    = ITBIS Sujeto × Coeficiente
                  </div>
                </div>

                <div className="bg-red-50 p-6 rounded-lg border-2 border-red-200">
                  <div className="text-sm text-gray-600 mb-2">Proporcionalidad No Admitida</div>
                  <div className="text-3xl font-bold text-red-600">
                    {formatCurrency(data.nonAdmittedProportionality)}
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    = ITBIS Sujeto − ITBIS Deducible
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700">
                  <strong>Nota:</strong> Este cálculo es indicativo y debe validarse según las operaciones específicas de su empresa 
                  y las normativas de la DGII. Consulte con su contador para ajustes según exenciones especiales o régimen tributario aplicable.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
