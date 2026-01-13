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
  const [missingExpenseTypeCount, setMissingExpenseTypeCount] = useState(0);

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

      // Contar registros sin tipo de gasto (obligatorio para el 606)
      const missingExpenseTypeCount = Array.isArray(data)
        ? data.filter((row: any) => !row?.tipo_bienes_servicios || String(row.tipo_bienes_servicios).trim() === '').length
        : 0;

      // Guardar el conteo para bloquear exportación
      setMissingExpenseTypeCount(missingExpenseTypeCount);

      if (missingExpenseTypeCount > 0) {
        alert(
          `⚠️ HAY ${missingExpenseTypeCount} REGISTRO(S) SIN "TIPO DE GASTO 606"\n\n` +
          'Según las normas de la DGII, el Tipo de Bienes y Servicios (columna 3) es OBLIGATORIO.\n\n' +
          'La exportación del archivo oficial estará BLOQUEADA hasta que corrija estos registros.\n\n' +
          'Por favor, edite las facturas de suplidor correspondientes y asigne el Tipo de Gasto 606 correcto (01-11).'
        );
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
    const ws = wb.addWorksheet('Formato 606');

    // Formato oficial DGII: 23 columnas
    const headers = [
      { num: 1, title: 'RNC o\nCédula', width: 14 },
      { num: 2, title: 'Tipo Id', width: 8 },
      { num: 3, title: 'Tipo Bienes y Servicios Comprados', width: 38 },
      { num: 4, title: 'NCF', width: 20 },
      { num: 5, title: 'NCF ó Documento\nModificado', width: 20 },
      { num: 6, title: 'Fecha\nComprobante', width: 12 },
      { num: 7, title: 'Fecha Pago', width: 12 },
      { num: 8, title: 'Monto Facturado\nen Servicios', width: 16 },
      { num: 9, title: 'Monto Facturado\nen Bienes', width: 16 },
      { num: 10, title: 'Total Monto\nFacturado', width: 16 },
      { num: 11, title: 'ITBIS Facturado', width: 14 },
      { num: 12, title: 'ITBIS Retenido', width: 14 },
      { num: 13, title: 'ITBIS sujeto a\nProporcionalidad\n(Art. 349)', width: 16 },
      { num: 14, title: 'ITBIS llevado al\nCosto', width: 14 },
      { num: 15, title: 'ITBIS por\nAdelantar', width: 14 },
      { num: 16, title: 'ITBIS percibido\nen compras', width: 14 },
      { num: 17, title: 'Tipo de\nRetención en\nISR', width: 12 },
      { num: 18, title: 'Monto Retención\nRenta', width: 16 },
      { num: 19, title: 'ISR Percibido en\ncompras', width: 14 },
      { num: 20, title: 'Impuesto Selectivo\nal Consumo', width: 16 },
      { num: 21, title: 'Otros\nImpuestos/Tasas', width: 14 },
      { num: 22, title: 'Monto Propina\nLegal', width: 14 },
      { num: 23, title: 'Forma de Pago', width: 16 },
    ];

    const totalColumns = headers.length;
    const blueColor = 'FF1E3A5F'; // Azul oscuro (en lugar de verde DGII)

    let currentRow = 1;

    // Encabezado institucional (estilo DGII pero azul)
    ws.mergeCells(currentRow, 1, currentRow, 6);
    const dgiiCell = ws.getCell(currentRow, 1);
    dgiiCell.value = companyName || 'Dirección General de Impuestos Internos';
    dgiiCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    dgiiCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    dgiiCell.alignment = { horizontal: 'left', vertical: 'middle' };

    ws.mergeCells(currentRow, 7, currentRow, totalColumns);
    const toolCell = ws.getCell(currentRow, 7);
    toolCell.value = 'Herramienta de Distribución Gratuita';
    toolCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    toolCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    toolCell.alignment = { horizontal: 'right', vertical: 'middle' };
    currentRow++;

    // Subtítulo
    ws.mergeCells(currentRow, 1, currentRow, 6);
    const subtitleCell = ws.getCell(currentRow, 1);
    subtitleCell.value = 'Formato de Envío de Compras de Bienes y Servicios';
    subtitleCell.font = { bold: true, size: 11 };
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    subtitleCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    currentRow++;

    // Info empresa y período
    ws.getCell(currentRow, 1).value = 'RNC o Cédula';
    ws.getCell(currentRow, 2).value = companyRnc;
    ws.getCell(currentRow, 2).font = { bold: true };
    currentRow++;

    ws.getCell(currentRow, 1).value = 'Período';
    ws.getCell(currentRow, 2).value = selectedPeriod.replace('-', '');
    ws.getCell(currentRow, 2).font = { bold: true };
    currentRow++;

    ws.getCell(currentRow, 1).value = 'Cantidad Registros';
    ws.getCell(currentRow, 2).value = reportData.length;
    ws.getCell(currentRow, 2).font = { bold: true };
    currentRow++;

    // Línea vacía
    currentRow++;

    // Fila de números de columna (1-23)
    const numRow = ws.getRow(currentRow);
    headers.forEach((h, idx) => {
      const cell = numRow.getCell(idx + 1);
      cell.value = h.num;
      cell.font = { bold: true, size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
    currentRow++;

    // Fila de encabezados de columnas (azul + texto blanco)
    const headerRow = ws.getRow(currentRow);
    headerRow.height = 45;
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h.title;
      cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
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
      dataRow.getCell(8).value = row.servicios_facturados || 0;
      dataRow.getCell(9).value = row.bienes_facturados || 0;
      dataRow.getCell(10).value = row.monto_facturado || 0;
      dataRow.getCell(11).value = row.itbis_facturado || 0;
      dataRow.getCell(12).value = row.itbis_retenido || 0;
      dataRow.getCell(13).value = (row as any).itbis_proporcionalidad || 0; // ITBIS proporcionalidad
      dataRow.getCell(14).value = (row as any).itbis_al_costo || 0; // ITBIS al costo
      dataRow.getCell(15).value = (row as any).itbis_por_adelantar || 0; // ITBIS por adelantar
      dataRow.getCell(16).value = 0; // ITBIS percibido
      dataRow.getCell(17).value = ''; // Tipo retención ISR
      dataRow.getCell(18).value = row.retencion_renta || 0;
      dataRow.getCell(19).value = row.isr_percibido || 0;
      dataRow.getCell(20).value = row.impuesto_selectivo_consumo || 0;
      dataRow.getCell(21).value = row.otros_impuestos || 0;
      dataRow.getCell(22).value = row.monto_propina_legal || 0;
      dataRow.getCell(23).value = row.forma_pago;

      // Bordes y formato numérico
      for (let c = 1; c <= totalColumns; c++) {
        const cell = dataRow.getCell(c);
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        };
        // Formato numérico para columnas de montos (8-22 excepto 17 y 23)
        if (c >= 8 && c <= 22 && c !== 17) {
          cell.numFmt = '#,##0.00';
        }
      }
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

        // Distribución automática del ITBIS según tipo de gasto
        const itbisSujProp = toMoney((row as any).itbis_proporcionalidad || 0);
        const itbisLlevCosto = toMoney((row as any).itbis_al_costo || 0);
        const itbisPorAdel = toMoney((row as any).itbis_por_adelantar || 0);
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
                       {formatAmount(summary.totalAmount)}
                    </div>
                    <div className="text-sm text-gray-600">Monto Total</div>
                  </div>
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600">
                       {formatAmount(summary.totalItbis)}
                    </div>
                    <div className="text-sm text-gray-600">Total ITBIS</div>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                       {formatAmount(summary.totalRetention)}
                    </div>
                    <div className="text-sm text-gray-600">Total Retenciones</div>
                  </div>
                </div>
              </div>
            )}

            {/* Alerta de registros incompletos */}
            {missingExpenseTypeCount > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <i className="ri-error-warning-line text-red-600 text-xl mt-0.5"></i>
                  <div>
                    <h3 className="text-red-800 font-semibold">⚠️ {missingExpenseTypeCount} registro(s) sin Tipo de Gasto 606</h3>
                    <p className="text-red-700 text-sm mt-1">
                      Según las normas de la DGII, el Tipo de Bienes y Servicios (columna 3) es <strong>OBLIGATORIO</strong>.
                      La exportación del archivo oficial TXT está <strong>BLOQUEADA</strong> hasta que corrija estos registros.
                    </p>
                    <p className="text-red-600 text-sm mt-2">
                      Por favor, edite las facturas de suplidor correspondientes y asigne el Tipo de Gasto 606 correcto (01-11).
                    </p>
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
                  disabled={missingExpenseTypeCount > 0}
                  className={`px-4 py-2 rounded-md flex items-center gap-2 whitespace-nowrap ${
                    missingExpenseTypeCount > 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-600 text-white hover:bg-gray-700'
                  }`}
                  title={missingExpenseTypeCount > 0 ? 'Bloqueado: hay registros sin Tipo de Gasto 606' : 'Exportar formato oficial DGII'}
                >
                  <i className="ri-file-text-line"></i>
                  Exportar TXT (DGII)
                  {missingExpenseTypeCount > 0 && <i className="ri-lock-line ml-1"></i>}
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RNC/Cédula</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo Gasto</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NCF</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Servicios</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bienes</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ITBIS</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Forma Pago</th>
                    </tr>
                  </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {reportData.map((row) => (
                    <tr key={row.id} className={`hover:bg-gray-50 ${!row.tipo_bienes_servicios ? 'bg-red-50' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.rnc_cedula}</td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${row.tipo_bienes_servicios ? 'text-gray-900' : 'text-red-600 font-semibold'}`}>
                        {row.tipo_bienes_servicios || '⚠️ Sin especificar'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.ncf}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.fecha_comprobante}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"> {formatAmount(row.servicios_facturados)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"> {formatAmount(row.bienes_facturados)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"> {formatAmount(row.itbis_facturado)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.forma_pago}</td>
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