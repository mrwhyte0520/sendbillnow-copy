import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { taxService, settingsService } from '../../../services/database';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
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
        formatMoney(row.monto_facturado, ''),
        formatMoney(row.itbis_facturado, ''),
        formatMoney(row.itbis_retenido, ''),
        formatMoney(row.monto_propina_legal, ''),
        formatMoney(row.itbis_retenido_propina, ''),
        formatMoney(row.itbis_percibido_ventas, ''),
        formatMoney(row.retencion_renta_terceros, ''),
        formatMoney(row.isr_percibido_ventas, ''),
        formatMoney(row.impuesto_selectivo_consumo, ''),
        formatMoney(row.otros_impuestos_tasas, ''),
        formatMoney(row.monto_propina_legal_2, '')
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
    const ws = wb.addWorksheet('Formato 607');

    // Formato oficial DGII: 23 columnas
    const headers = [
      { num: 1, title: 'RNC/Cédula o\nPasaporte', width: 18 },
      { num: 2, title: 'Tipo Identificación', width: 12 },
      { num: 3, title: 'Número Comprobante Fiscal', width: 22 },
      { num: 4, title: 'Número Comprobante Fiscal\nModificado', width: 22 },
      { num: 5, title: 'Tipo de Ingreso', width: 20 },
      { num: 6, title: 'Fecha Comprobante', width: 14 },
      { num: 7, title: 'Fecha de Retención', width: 14 },
      { num: 8, title: 'Monto Facturado', width: 16 },
      { num: 9, title: 'ITBIS Facturado', width: 14 },
      { num: 10, title: 'ITBIS Retenido por\nTerceros', width: 16 },
      { num: 11, title: 'ITBIS Percibido', width: 14 },
      { num: 12, title: 'Retención Renta por\nTerceros', width: 16 },
      { num: 13, title: 'ISR Percibido', width: 14 },
      { num: 14, title: 'Impuesto Selectivo\nal Consumo', width: 16 },
      { num: 15, title: 'Otros\nImpuestos/Tasas', width: 14 },
      { num: 16, title: 'Monto Propina Legal', width: 16 },
      { num: 17, title: 'Efectivo', width: 14 },
      { num: 18, title: 'Cheque/\nTransferencia/\nDepósito', width: 16 },
      { num: 19, title: 'Tarjeta\nDébito/Crédito', width: 14 },
      { num: 20, title: 'Venta a Crédito', width: 14 },
      { num: 21, title: 'Bonos o Certificados\nde Regalo', width: 16 },
      { num: 22, title: 'Permuta', width: 12 },
      { num: 23, title: 'Otras Formas de\nVentas', width: 14 },
    ];

    const totalColumns = headers.length;
    const blueColor = 'FF008000'; // Azul oscuro (en lugar de verde DGII)

    let currentRow = 1;

    // Encabezado institucional (estilo DGII pero azul)
    ws.mergeCells(currentRow, 1, currentRow, 6);
    const dgiiCell = ws.getCell(currentRow, 1);
    dgiiCell.value = companyName || 'Formato de Envío de Ventas de Bienes y Servicios';
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
    subtitleCell.value = 'Formato de Envío de Ventas de Bienes y Servicios';
    subtitleCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
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
      dataRow.getCell(3).value = row.numero_comprobante_fiscal;
      dataRow.getCell(4).value = ''; // NCF Modificado
      dataRow.getCell(5).value = '01 - Ingresos por Operaciones (No Financieros)'; // Tipo Ingreso
      dataRow.getCell(6).value = row.fecha_comprobante;
      dataRow.getCell(7).value = ''; // Fecha Retención
      dataRow.getCell(8).value = row.monto_facturado || 0;
      dataRow.getCell(9).value = row.itbis_facturado || 0;
      dataRow.getCell(10).value = row.itbis_retenido || 0;
      dataRow.getCell(11).value = row.itbis_percibido_ventas || 0;
      dataRow.getCell(12).value = row.retencion_renta_terceros || 0;
      dataRow.getCell(13).value = row.isr_percibido_ventas || 0;
      dataRow.getCell(14).value = row.impuesto_selectivo_consumo || 0;
      dataRow.getCell(15).value = row.otros_impuestos_tasas || 0;
      dataRow.getCell(16).value = row.monto_propina_legal || 0;
      dataRow.getCell(17).value = 0; // Efectivo
      dataRow.getCell(18).value = 0; // Cheque/Transferencia
      dataRow.getCell(19).value = 0; // Tarjeta
      dataRow.getCell(20).value = row.monto_facturado || 0; // Venta a Crédito (por defecto)
      dataRow.getCell(21).value = 0; // Bonos
      dataRow.getCell(22).value = 0; // Permuta
      dataRow.getCell(23).value = 0; // Otras formas

      // Bordes y formato numérico
      for (let c = 1; c <= totalColumns; c++) {
        const cell = dataRow.getCell(c);
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        };
        // Formato numérico para columnas de montos (8-23 excepto algunas)
        if (c >= 8 && c <= 23 && c !== 5) {
          cell.numFmt = '#,##0.00';
        }
      }
      currentRow++;
    }

    // Anchos de columna
    headers.forEach((h, idx) => {
      ws.getColumn(idx + 1).width = h.width;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `reporte_607_${selectedPeriod}.xlsx`);
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
        monto_facturado: formatMoney(row.monto_facturado, ''),
        itbis_facturado: formatMoney(row.itbis_facturado, ''),
        itbis_retenido: formatMoney(row.itbis_retenido, ''),
        isr_retenido: formatMoney(row.retencion_renta_terceros, ''),
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
            {!!((companyInfo as any)?.rnc || (companyInfo as any)?.tax_id) && (
              <p className="text-gray-600 text-sm">
                RNC: {String((companyInfo as any)?.rnc || (companyInfo as any)?.tax_id)}
              </p>
            )}
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
                    {formatMoney(totals.monto_facturado, '')}
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
                    {formatMoney(totals.itbis_facturado, '')}
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
                    {formatMoney(totals.itbis_retenido, '')}
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
                    {formatMoney(totals.retencion_renta_terceros, '')}
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
                      {formatMoney(row.monto_facturado, '')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(row.itbis_facturado, '')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(row.itbis_retenido, '')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(row.retencion_renta_terceros, '')}
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