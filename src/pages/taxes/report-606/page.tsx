import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { taxService, settingsService } from '../../../services/database';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { exportToPdf } from '../../../utils/exportImportUtils';
import { formatAmount } from '../../../utils/numberFormat';

interface Report606Data {
  id: string;
  period: string;
  rnc_cedula: string;
  tipo_identificacion: string;
  tipo_bienes_servicios: string;
  ncf: string;
  ncf_modificado?: string;
  fecha_comprobante: string;
  fecha_pago: string;
  servicios_facturados: number;
  bienes_facturados: number;
  monto_facturado: number;
  itbis_facturado: number;
  itbis_retenido: number;
  retencion_renta: number;
  isr_percibido: number;
  impuesto_selectivo_consumo: number;
  otros_impuestos: number;
  monto_propina_legal: number;
  forma_pago: string;
}

interface Report606Summary {
  totalRecords: number;
  totalAmount: number;
  totalItbis: number;
  totalRetention: number;
}

export default function Report606Page() {
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [reportData, setReportData] = useState<Report606Data[]>([]);
  const [summary, setSummary] = useState<Report606Summary | null>(null);
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
        console.error('Error cargando información de la empresa para Reporte 606', error);
      }
    };

    loadCompany();
  }, []);

  const generateReport = async () => {
    const period = `${selectedYear}-${selectedMonth}`;
    setSelectedPeriod(period);

    if (!selectedYear || !selectedMonth) {
      alert('Por favor selecciona mes y año');
      return;
    }

    setLoading(true);
    try {
      // Construir los datos del 606 para el período antes de consultar el reporte
      await taxService.buildReport606(period);

      const data = await taxService.generateReport606(period);
      const summaryData = await taxService.getReport606Summary(period) as any;

      const missingExpenseTypeCount = Array.isArray(data)
        ? data.filter((row: any) => !row?.tipo_bienes_servicios || String(row.tipo_bienes_servicios).trim() === '').length
        : 0;

      if (missingExpenseTypeCount > 0) {
        const proceed = confirm(
          `Hay ${missingExpenseTypeCount} registro(s) sin "Tipo de gasto (606)". ` +
          'Esto puede afectar el archivo oficial para la DGII. ¿Deseas continuar de todos modos?'
        );
        if (!proceed) {
          setLoading(false);
          return;
        }
      }

      const totalRecords = Array.isArray(data) ? data.length : 0;
      const totalAmount = Number(summaryData?.totalMonto ?? 0);
      const totalItbis = Number(summaryData?.totalItbis ?? 0);
      const totalRetention = Number(summaryData?.totalRetenido ?? 0);

      setReportData(Array.isArray(data) ? data : []);
      setSummary({ totalRecords, totalAmount, totalItbis, totalRetention });
      setShowResults(true);
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Error al generar el reporte');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (reportData.length === 0) return;

    const separator = ';';

    const headers = [
      'RNC/Cédula',
      'Tipo ID',
      'Tipo Bienes/Servicios',
      'NCF',
      'NCF Modificado',
      'Fecha Comprobante',
      'Fecha Pago',
      'Servicios Facturados',
      'Bienes Facturados',
      'Monto Facturado',
      'ITBIS Facturado',
      'ITBIS Retenido',
      'Retención Renta',
      'ISR Percibido',
      'Impuesto Selectivo',
      'Otros Impuestos',
      'Propina Legal',
      'Forma Pago'
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

    headerLines.push(['Reporte', 'Reporte 606 - Compras y Servicios'].join(separator));
    headerLines.push(['Período', selectedPeriod].join(separator));
    headerLines.push('');

    const csvContent = [
      ...headerLines,
      headers.join(separator),
      ...reportData.map(row => [
        row.rnc_cedula,
        row.tipo_identificacion,
        row.tipo_bienes_servicios,
        row.ncf,
        row.ncf_modificado || '',
        row.fecha_comprobante,
        row.fecha_pago,
        Number(row.servicios_facturados ?? 0).toFixed(2),
        Number(row.bienes_facturados ?? 0).toFixed(2),
        Number(row.monto_facturado ?? 0).toFixed(2),
        Number(row.itbis_facturado ?? 0).toFixed(2),
        Number(row.itbis_retenido ?? 0).toFixed(2),
        Number(row.retencion_renta ?? 0).toFixed(2),
        Number(row.isr_percibido ?? 0).toFixed(2),
        Number(row.impuesto_selectivo_consumo ?? 0).toFixed(2),
        Number(row.otros_impuestos ?? 0).toFixed(2),
        Number(row.monto_propina_legal ?? 0).toFixed(2),
        row.forma_pago
      ].join(separator))
    ].join('\n');

    const csvForExcel = '\uFEFF' + csvContent.replace(/\n/g, '\r\n');
    const blob = new Blob([csvForExcel], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `reporte_606_${selectedPeriod}.csv`;
    link.click();
  };

  const exportToExcel = async () => {
    if (reportData.length === 0) return;

    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';

    const companyRnc =
      (companyInfo as any)?.rnc ||
      (companyInfo as any)?.tax_id ||
      '';

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Reporte 606');

    const headers = [
      { key: 'rnc', title: 'RNC/Cédula', width: 15 },
      { key: 'tipoId', title: 'Tipo ID', width: 10 },
      { key: 'tipoBien', title: 'Tipo Bien/Serv.', width: 22 },
      { key: 'ncf', title: 'NCF', width: 22 },
      { key: 'ncfMod', title: 'NCF Mod.', width: 22 },
      { key: 'fComp', title: 'F. Comp.', width: 12 },
      { key: 'fPago', title: 'F. Pago', width: 12 },
      { key: 'servFact', title: 'Serv. Fact.', width: 14 },
      { key: 'bienesFact', title: 'Bienes Fact.', width: 14 },
      { key: 'montoFact', title: 'Monto Fact.', width: 14 },
      { key: 'itbisFact', title: 'ITBIS Fact.', width: 14 },
      { key: 'itbisRet', title: 'ITBIS Ret.', width: 14 },
      { key: 'retRenta', title: 'Ret. Renta', width: 14 },
      { key: 'formaPago', title: 'Forma Pago', width: 12 },
    ];

    let currentRow = 1;
    const totalColumns = headers.length;

    // Encabezado: empresa
    ws.mergeCells(currentRow, 1, currentRow, totalColumns);
    const companyCell = ws.getCell(currentRow, 1);
    companyCell.value = companyName;
    companyCell.font = { bold: true, size: 14 };
    companyCell.alignment = { horizontal: 'left', vertical: 'middle' };
    currentRow++;

    // RNC (si existe)
    if (companyRnc) {
      ws.mergeCells(currentRow, 1, currentRow, totalColumns);
      const rncCell = ws.getCell(currentRow, 1);
      rncCell.value = `RNC: ${companyRnc}`;
      rncCell.font = { bold: true };
      rncCell.alignment = { horizontal: 'left', vertical: 'middle' };
      currentRow++;
    }

    // Título del reporte
    ws.mergeCells(currentRow, 1, currentRow, totalColumns);
    const titleCell = ws.getCell(currentRow, 1);
    titleCell.value = 'Reporte 606 - Compras y Servicios';
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    currentRow++;

    // Período
    ws.mergeCells(currentRow, 1, currentRow, totalColumns);
    const periodCell = ws.getCell(currentRow, 1);
    periodCell.value = `Período: ${selectedPeriod}`;
    periodCell.alignment = { horizontal: 'left', vertical: 'middle' };
    currentRow++;

    // Fila vacía
    currentRow++;

    // Fila de encabezados de columnas (azul marino + texto blanco)
    const headerRow = ws.getRow(currentRow);
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h.title;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0B1F3A' },
      };
      cell.alignment = { vertical: 'middle' };
    });
    currentRow++;

    // Datos
    for (const row of reportData) {
      const dataRow = ws.getRow(currentRow);
      dataRow.getCell(1).value = row.rnc_cedula;
      dataRow.getCell(2).value = row.tipo_identificacion;
      dataRow.getCell(3).value = row.tipo_bienes_servicios;
      dataRow.getCell(4).value = row.ncf;
      dataRow.getCell(5).value = row.ncf_modificado || '';
      dataRow.getCell(6).value = row.fecha_comprobante;
      dataRow.getCell(7).value = row.fecha_pago;
      dataRow.getCell(8).value = row.servicios_facturados;
      dataRow.getCell(9).value = row.bienes_facturados;
      dataRow.getCell(10).value = row.monto_facturado;
      dataRow.getCell(11).value = row.itbis_facturado;
      dataRow.getCell(12).value = row.itbis_retenido;
      dataRow.getCell(13).value = row.retencion_renta;
      dataRow.getCell(14).value = row.forma_pago;
      currentRow++;
    }

    // Anchos de columna
    headers.forEach((h, idx) => {
      ws.getColumn(idx + 1).width = h.width;
    });

    // Hoja de resumen
    if (summary) {
      const wsSummary = wb.addWorksheet('Resumen');
      let sRow = 1;

      wsSummary.mergeCells(sRow, 1, sRow, 2);
      const sCompanyCell = wsSummary.getCell(sRow, 1);
      sCompanyCell.value = companyName;
      sCompanyCell.font = { bold: true };
      sRow++;

      if (companyRnc) {
        wsSummary.mergeCells(sRow, 1, sRow, 2);
        const sRncCell = wsSummary.getCell(sRow, 1);
        sRncCell.value = `RNC: ${companyRnc}`;
        sRow++;
      }

      wsSummary.mergeCells(sRow, 1, sRow, 2);
      const sTitleCell = wsSummary.getCell(sRow, 1);
      sTitleCell.value = 'Reporte 606 - Resumen';
      sTitleCell.font = { bold: true };
      sRow++;

      wsSummary.mergeCells(sRow, 1, sRow, 2);
      const sPeriodCell = wsSummary.getCell(sRow, 1);
      sPeriodCell.value = `Período: ${selectedPeriod}`;
      sRow++;
      sRow++;

      // Header resumen
      const summaryHeaderRow = wsSummary.getRow(sRow);
      summaryHeaderRow.getCell(1).value = 'Concepto';
      summaryHeaderRow.getCell(2).value = 'Valor';
      [1, 2].forEach(c => {
        const cell = summaryHeaderRow.getCell(c);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
      });
      sRow++;

      const summaryItems = [
        ['Total de Registros', summary.totalRecords],
        ['Monto Total Facturado', summary.totalAmount],
        ['Total ITBIS', summary.totalItbis],
        ['Total Retenciones', summary.totalRetention],
      ];
      summaryItems.forEach(([label, value]) => {
        const r = wsSummary.getRow(sRow);
        r.getCell(1).value = label;
        r.getCell(2).value = value;
        sRow++;
      });

      wsSummary.getColumn(1).width = 25;
      wsSummary.getColumn(2).width = 20;
    }

    // Descargar
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `reporte_606_${selectedPeriod}.xlsx`);
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

    // TXT oficial DGII (606): sin encabezados, una línea por registro
    const txtContent = (reportData || [])
      .map((row) => {
        const rnc = String(row.rnc_cedula || '').trim();
        const tipoId = toTipoId(rnc);
        const ncf = String(row.ncf || '').trim();
        const ncfMod = String(row.ncf_modificado || '').trim();

        const fechaComp = toYyyymmdd(row.fecha_comprobante);
        const fechaPago = toYyyymmdd(row.fecha_pago);

        const montoFact = toMoney(row.monto_facturado);
        const itbisFact = toMoney(row.itbis_facturado);
        const itbisRet = toMoney(row.itbis_retenido);

        // Campos no manejados actualmente: exportar en 0.00 / 0
        const itbisSujProp = toMoney(0);
        const itbisLlevCosto = toMoney(0);
        const itbisPorAdel = toMoney(row.itbis_facturado);
        const itbisPerc = toMoney(0);

        const tipoRetIsr = '0';
        const montoRetRenta = toMoney(row.retencion_renta);
        const isrPerc = toMoney(row.isr_percibido);
        const isc = toMoney(row.impuesto_selectivo_consumo);
        const otros = toMoney(row.otros_impuestos);
        const propina = toMoney(row.monto_propina_legal);

        return [
          rnc,
          tipoId,
          ncf,
          ncfMod,
          fechaComp,
          fechaPago,
          montoFact,
          itbisFact,
          itbisRet,
          itbisSujProp,
          itbisLlevCosto,
          itbisPorAdel,
          itbisPerc,
          tipoRetIsr,
          montoRetRenta,
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
    link.download = `DGII_606_${String(selectedPeriod || '').replace('-', '')}.TXT`;
    link.click();
  };

  const handleExportPdf = async () => {
    if (reportData.length === 0) return;

    try {
      const data = reportData.map(row => ({
        rnc_cedula: row.rnc_cedula,
        tipo_id: row.tipo_identificacion,
        tipo_bien_servicio: row.tipo_bienes_servicios,
        ncf: row.ncf,
        ncf_modificado: row.ncf_modificado || '',
        fecha_comprobante: row.fecha_comprobante,
        fecha_pago: row.fecha_pago,
        servicios_facturados: row.servicios_facturados,
        bienes_facturados: row.bienes_facturados,
        monto_facturado: row.monto_facturado,
        itbis_facturado: row.itbis_facturado,
        itbis_retenido: row.itbis_retenido,
        retencion_renta: row.retencion_renta,
        forma_pago: row.forma_pago,
      }));

      const columns = [
        { key: 'rnc_cedula', label: 'RNC/Cédula' },
        { key: 'tipo_id', label: 'Tipo ID' },
        { key: 'tipo_bien_servicio', label: 'Tipo Bien/Serv.' },
        { key: 'ncf', label: 'NCF' },
        { key: 'ncf_modificado', label: 'NCF Mod.' },
        { key: 'fecha_comprobante', label: 'F. Comp.' },
        { key: 'fecha_pago', label: 'F. Pago' },
        { key: 'servicios_facturados', label: 'Serv. Fact.' },
        { key: 'bienes_facturados', label: 'Bienes Fact.' },
        { key: 'monto_facturado', label: 'Monto Fact.' },
        { key: 'itbis_facturado', label: 'ITBIS Fact.' },
        { key: 'itbis_retenido', label: 'ITBIS Ret.' },
        { key: 'retencion_renta', label: 'Ret. Renta' },
        { key: 'forma_pago', label: 'Forma Pago' },
      ];

      await exportToPdf(
        data,
        columns,
        `reporte_606_${selectedPeriod}`,
        'Reporte 606 - Compras y Servicios',
        'l',
      );
    } catch (error) {
      console.error('Error exporting Reporte 606 to PDF:', error);
      alert('Error al exportar a PDF. Revisa la consola para más detalles.');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Reporte 606</h1>
          <p className="text-gray-600">Reporte de Compras y Servicios</p>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Generar Reporte</h2>

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
            onClick={generateReport}
            disabled={loading || !selectedYear || !selectedMonth}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {loading ? 'Generando...' : 'Generar Reporte'}
          </button>
        </div>

        {/* Resultados */}
        {showResults && (
          <>
            {/* Resumen */}
            {summary && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumen del Período</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{summary.totalRecords}</div>
                    <div className="text-sm text-gray-600">Total Registros</div>
                  </div>
                  
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      RD$ {formatAmount(summary.totalAmount)}
                    </div>
                    <div className="text-sm text-gray-600">Monto Total</div>
                  </div>
                  
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600">
                      RD$ {formatAmount(summary.totalItbis)}
                    </div>
                    <div className="text-sm text-gray-600">Total ITBIS</div>
                  </div>
                  
                  <div className="bg-red-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                      RD$ {formatAmount(summary.totalRetention)}
                    </div>
                    <div className="text-sm text-gray-600">Total Retenciones</div>
                  </div>
                </div>
              </div>
            )}

            {/* Botones de exportación */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Exportar Datos</h2>
              
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={exportToCSV}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex items-center gap-2 whitespace-nowrap"
                >
                  <i className="ri-file-excel-2-line"></i>
                  Exportar CSV
                </button>
                
                <button
                  onClick={exportToExcel}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2 whitespace-nowrap"
                >
                  <i className="ri-file-excel-line"></i>
                  Exportar Excel
                </button>
                
                <button
                  onClick={exportToTXT}
                  className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 flex items-center gap-2 whitespace-nowrap"
                >
                  <i className="ri-file-text-line"></i>
                  Exportar TXT
                </button>
                
                <button
                  onClick={handleExportPdf}
                  className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 flex items-center gap-2 whitespace-nowrap"
                >
                  <i className="ri-file-pdf-line"></i>
                  Exportar PDF
                </button>
              </div>
            </div>

            {/* Tabla de datos */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  Datos del Reporte ({reportData.length} registros)
                </h2>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
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
                        Monto
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ITBIS
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Retención
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Forma Pago
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reportData.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.rnc_cedula}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.ncf}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.fecha_comprobante}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          RD$ {formatAmount(row.monto_facturado)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          RD$ {formatAmount(row.itbis_facturado)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          RD$ {formatAmount(row.itbis_retenido)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.forma_pago}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}