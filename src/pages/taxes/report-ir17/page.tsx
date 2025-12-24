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
    const ws = wb.addWorksheet('IR-17');

    const blueColor = 'FF1E3A5F'; // Azul marino oscuro

    // Helper para agregar sección azul marino
    const addBlueSection = (text: string) => {
      ws.mergeCells(currentRow, 1, currentRow, 6);
      const cell = ws.getCell(currentRow, 1);
      cell.value = text;
      cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      currentRow++;
    };

    // Helper para agregar fila de datos con signo + y -
    const addDataRow = (num: string, desc: string, signo: string = '+', tasa: string = '', impuesto: number = 0) => {
      ws.getCell(currentRow, 1).value = num;
      ws.getCell(currentRow, 1).alignment = { horizontal: 'center' };
      ws.getCell(currentRow, 2).value = desc;
      ws.getCell(currentRow, 3).value = signo;
      ws.getCell(currentRow, 3).alignment = { horizontal: 'center' };
      ws.getCell(currentRow, 4).value = tasa;
      ws.getCell(currentRow, 4).alignment = { horizontal: 'center' };
      ws.getCell(currentRow, 5).value = impuesto;
      ws.getCell(currentRow, 5).numFmt = '#,##0.00';
      ws.getCell(currentRow, 5).alignment = { horizontal: 'right' };
      ws.getCell(currentRow, 6).value = '-';
      ws.getCell(currentRow, 6).alignment = { horizontal: 'center' };
      currentRow++;
    };

    let currentRow = 1;

    // === ENCABEZADO ===
    // Fila 1: Logo DGII + Título + IR-17
    ws.mergeCells(currentRow, 1, currentRow, 2);
    const logoCell = ws.getCell(currentRow, 1);
    logoCell.value = companyName;
    logoCell.font = { bold: true, size: 11 };
    logoCell.alignment = { horizontal: 'left', vertical: 'middle' };

    ws.mergeCells(currentRow, 3, currentRow, 5);
    const titleCell = ws.getCell(currentRow, 3);
    titleCell.value = 'DECLARACIÓN JURADA O PAGO DE OTRAS RETENCIONES Y RETRIBUCIONES COMPLEMENTARIAS';
    titleCell.font = { bold: true, size: 11 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    ws.getCell(currentRow, 6).value = 'IR-17';
    ws.getCell(currentRow, 6).font = { bold: true, size: 14 };
    ws.getCell(currentRow, 6).alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getRow(currentRow).height = 30;
    currentRow++;

    // Fila 2: Versión + Período Fiscal
    ws.getCell(currentRow, 1).value = 'Versión 2025';
    ws.getCell(currentRow, 1).font = { size: 9 };
    ws.mergeCells(currentRow, 5, currentRow, 6);
    ws.getCell(currentRow, 5).value = `PERÍODO FISCAL: ${(reportPeriod || selectedPeriod).replace('-', '/')}`;
    ws.getCell(currentRow, 5).font = { bold: true, size: 9 };
    ws.getCell(currentRow, 5).alignment = { horizontal: 'right' };
    currentRow++;
    currentRow++;

    // === I. DATOS GENERALES DEL CONTRIBUYENTE ===
    addBlueSection('I. DATOS GENERALES DEL CONTRIBUYENTE');
    ws.mergeCells(currentRow, 1, currentRow, 6);
    ws.getCell(currentRow, 1).value = 'Complete los siguientes campos con los datos generales del contribuyente.';
    ws.getCell(currentRow, 1).font = { italic: true, size: 9 };
    currentRow++;

    // Campos de datos generales
    ws.getCell(currentRow, 1).value = 'TIPO DE DECLARACIÓN:';
    ws.getCell(currentRow, 1).font = { bold: true, size: 9 };
    currentRow++;

    ws.getCell(currentRow, 1).value = 'RNC/CÉDULA:';
    ws.getCell(currentRow, 1).font = { bold: true, size: 9 };
    ws.getCell(currentRow, 2).value = companyRnc;
    ws.getCell(currentRow, 3).value = 'RAZÓN SOCIAL/NOMBRE:';
    ws.getCell(currentRow, 3).font = { bold: true, size: 9 };
    ws.mergeCells(currentRow, 4, currentRow, 6);
    ws.getCell(currentRow, 4).value = companyName;
    currentRow++;

    ws.getCell(currentRow, 1).value = 'NOMBRE COMERCIAL:';
    ws.getCell(currentRow, 1).font = { bold: true, size: 9 };
    currentRow++;

    ws.getCell(currentRow, 1).value = 'TELÉFONO:';
    ws.getCell(currentRow, 1).font = { bold: true, size: 9 };
    ws.getCell(currentRow, 3).value = 'CORREO ELECTRÓNICO:';
    ws.getCell(currentRow, 3).font = { bold: true, size: 9 };
    currentRow++;
    currentRow++;

    // === II. OTRAS RETENCIONES ===
    addBlueSection('II. OTRAS RETENCIONES');
    ws.mergeCells(currentRow, 1, currentRow, 6);
    ws.getCell(currentRow, 1).value = 'Complete los siguientes campos con los datos de otras retenciones.';
    ws.getCell(currentRow, 1).font = { italic: true, size: 9 };
    currentRow++;
    currentRow++;

    // Encabezado de tabla
    ws.mergeCells(currentRow, 1, currentRow, 2);
    ws.getCell(currentRow, 1).value = 'DETALLE DE LA RENTA NETA IMPONIBLE O PÉRDIDA FISCAL';
    ws.getCell(currentRow, 1).font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    ws.getCell(currentRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    ws.getCell(currentRow, 3).value = '';
    ws.getCell(currentRow, 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    ws.getCell(currentRow, 4).value = 'TASA';
    ws.getCell(currentRow, 4).font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    ws.getCell(currentRow, 4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    ws.getCell(currentRow, 4).alignment = { horizontal: 'center' };
    ws.getCell(currentRow, 5).value = 'IMPUESTO (RD$)';
    ws.getCell(currentRow, 5).font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    ws.getCell(currentRow, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    ws.getCell(currentRow, 5).alignment = { horizontal: 'right' };
    ws.getCell(currentRow, 6).value = '';
    ws.getCell(currentRow, 6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    currentRow++;

    // Casillas 1-22
    addDataRow('1.', 'ALQUILERES', '+', '10.00%', 0);
    addDataRow('2.', 'HONORARIOS POR SERVICIOS INDEPENDIENTES', '+', '10.00%', 0);
    addDataRow('3.', 'PREMIOS (Ley 253-12)', '+', '25.00%', 0);
    addDataRow('4.', 'TRANSFERENCIA DE TÍTULO Y PROPIEDADES', '+', '2.00%', 0);
    addDataRow('5.', 'DIVIDENDOS (Ley 253-12)', '+', '10.00%', 0);
    addDataRow('6.', 'INTERESES A PERSONAS JURÍDICAS O ENTIDADES NO RESIDENTES (Ley 253-12)', '+', '10.00%', 0);
    addDataRow('7.', 'INTERESES A PERSONAS JURÍDICAS O ENTIDADES NO RESIDENTES (Ley 57-2007)', '+', '5.00%', 0);
    addDataRow('8.', 'INTERESES A PERSONAS FÍSICAS NO RESIDENTES (Ley 253-12)', '+', '10.00%', 0);
    addDataRow('9.', 'INTERESES A PERSONAS FÍSICAS NO RESIDENTES (Leyes 57-2007 y 253-12)', '+', '5.00%', 0);
    addDataRow('10.', 'REMESAS AL EXTERIOR (Ley 253-12)', '+', '27.00%', 0);
    addDataRow('11.', 'INTERESES PAGADOS POR ENTIDADES NO FINANCIERAS A PERSONAS FÍSICAS RESIDENTES', '+', '5.00%', 0);
    addDataRow('12.', 'PAGOS A PROVEEDORES DEL ESTADO (Ley 253-12)', '+', '5.00%', 0);
    addDataRow('13.', 'JUEGOS TELEFÓNICOS (Norma 08-2011)', '+', '5.00%', 0);
    addDataRow('14.', 'GANANCIA DE CAPITAL (Norma 07-2011)', '+', '1.00%', 0);
    addDataRow('15.', 'JUEGOS VÍA INTERNET (Ley 139-11, Art. 7)', '+', '10.00%', 0);
    addDataRow('16.', 'OTRAS RENTAS (Ley 11-92, Art. 309 Lit. f)', '+', '10.00%', 0);
    addDataRow('17.', 'OTRAS RENTAS (Decreto 139-98, Art. 70 Lit. a y b)', '+', '2.00%', 0);
    addDataRow('18.', 'OTRAS RETENCIONES (Norma 07-2007)', '+', '2.00%', 0);
    addDataRow('19.', 'INTERESES PAGADOS POR ENTIDADES FINANCIERAS A PERSONAS JURÍDICAS RESIDENTES (Norma 13-2011)', '+', '1.00%', 0);
    addDataRow('20.', 'INTERESES PAGADOS POR ENTIDADES FINANCIERAS A PERSONAS FÍSICAS RESIDENTES (Ley 253-12)', '+', '10.00%', 0);
    addDataRow('21.', 'ADQUISICIÓN DE BIENES DE PERSONAS FÍSICAS DEDICADAS AL SUBSECTOR DE GANADERÍA DE CARNE BOVINA (NORMA 04-25)', '+', '1.00%', 0);
    addDataRow('22.', 'OTRAS RETENCIONES (Casillas 1+2+3+...+21)', '', '', 0);
    currentRow++;

    // === III. APLICACIÓN DE CONVENIOS ===
    addBlueSection('III. APLICACIÓN DE CONVENIOS Y ACUERDOS INTERNACIONALES PARA EVITAR LA DOBLE TRIBUTACIÓN');
    addDataRow('23', 'OTRAS RETENCIONES EN CONVENIOS Y ACUERDOS INTERNACIONALES (Viene de casilla 35 del anexo R9C)', '-', '', 0);
    currentRow++;

    // === IV. TOTAL DE OTRAS RETENCIONES ===
    addBlueSection('IV. TOTAL DE OTRAS RETENCIONES');
    addDataRow('24', 'TOTAL DE OTRAS RETENCIONES (Casillas 22+23)', '=', '', totalIsrProveedores || 0);
    currentRow++;

    // === V. RETRIBUCIONES COMPLEMENTARIAS ===
    addBlueSection('V. RETRIBUCIONES COMPLEMENTARIAS');
    addDataRow('25', 'RETRIBUCIONES COMPLEMENTARIAS (Viene de casilla 12 del anexo IR9)', '+', '27.00%', 0);
    currentRow++;

    // === VI. LIQUIDACIÓN ===
    addBlueSection('VI. LIQUIDACIÓN');
    ws.mergeCells(currentRow, 1, currentRow, 6);
    ws.getCell(currentRow, 1).value = 'Complete los campos que apliquen para la liquidación.';
    ws.getCell(currentRow, 1).font = { italic: true, size: 9 };
    currentRow++;

    // Encabezado detalle liquidación
    ws.mergeCells(currentRow, 1, currentRow, 4);
    ws.getCell(currentRow, 1).value = 'DETALLE DE LA LIQUIDACIÓN';
    ws.getCell(currentRow, 1).font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    ws.getCell(currentRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    ws.mergeCells(currentRow, 5, currentRow, 6);
    ws.getCell(currentRow, 5).value = 'MONTO (RD$)';
    ws.getCell(currentRow, 5).font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    ws.getCell(currentRow, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    ws.getCell(currentRow, 5).alignment = { horizontal: 'right' };
    currentRow++;

    addDataRow('26', 'IMPUESTO A PAGAR (Casillas 24+25)', '-', '', totalIsrProveedores || 0);
    addDataRow('27', 'SALDOS COMPENSABLES AUTORIZADOS (Otros Impuestos)', '-', '', 0);
    addDataRow('28', 'PAGOS COMPUTABLES A CUENTA', '-', '', 0);
    addDataRow('29', 'SALDO A FAVOR ANTERIOR', '-', '', 0);
    addDataRow('30', 'DIFERENCIA A PAGAR (Si el valor de las casillas 26-27-28-29 es Positivo)', '-', '', totalIsrProveedores || 0);
    addDataRow('31', 'NUEVO SALDO A FAVOR (Si el valor de las casillas 26-27-28-29 es Negativo)', '=', '', 0);
    currentRow++;

    // === VII. PENALIDADES ===
    addBlueSection('VII. PENALIDADES');
    ws.mergeCells(currentRow, 1, currentRow, 4);
    ws.getCell(currentRow, 1).value = 'DETALLE DE PENALIDADES';
    ws.getCell(currentRow, 1).font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    ws.getCell(currentRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    ws.mergeCells(currentRow, 5, currentRow, 6);
    ws.getCell(currentRow, 5).value = 'MONTO (RD$)';
    ws.getCell(currentRow, 5).font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    ws.getCell(currentRow, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    currentRow++;

    addDataRow('32', 'RECARGOS', '+', '', 0);
    addDataRow('33', 'INTERÉS INDEMNIZATORIO', '+', '', 0);
    currentRow++;

    // === VIII. MONTO A PAGAR ===
    addBlueSection('VIII. MONTO A PAGAR');
    ws.mergeCells(currentRow, 1, currentRow, 4);
    ws.getCell(currentRow, 1).value = 'DETALLE DEL MONTO A PAGAR';
    ws.getCell(currentRow, 1).font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    ws.getCell(currentRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    ws.mergeCells(currentRow, 5, currentRow, 6);
    ws.getCell(currentRow, 5).value = 'MONTO (RD$)';
    ws.getCell(currentRow, 5).font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    ws.getCell(currentRow, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    currentRow++;

    addDataRow('34', 'TOTAL A PAGAR (Casillas 30+32+33)', '=', '', totalPagarDgii || 0);
    ws.getCell(currentRow - 1, 5).font = { bold: true, size: 12 };
    currentRow++;

    // === IX. JURAMENTO DEL DECLARANTE ===
    addBlueSection('IX. JURAMENTO DEL DECLARANTE');
    ws.mergeCells(currentRow, 1, currentRow, 6);
    ws.getCell(currentRow, 1).value = 'YO _________________________ PORTADOR DE LA CÉDULA DE IDENTIDAD Y ELECTORAL NO. _____________';
    ws.getCell(currentRow, 1).font = { size: 9 };
    currentRow++;
    ws.mergeCells(currentRow, 1, currentRow, 6);
    ws.getCell(currentRow, 1).value = 'EN CALIDAD DE _____________ POR LA PRESENTE AFIRMO BAJO JURAMENTO QUE LOS DATOS CONSIGNADOS EN LA PRESENTE DECLARACIÓN SON CORRECTOS Y COMPLETOS Y QUE NO HE OMITIDO NI FALSEADO DATO ALGUNO QUE LA MISMA DEBA CONTENER, SIENDO EN CONSECUENCIA TODO SU CONTENIDO LA FIEL EXPRESIÓN DE LA VERDAD.';
    ws.getCell(currentRow, 1).alignment = { wrapText: true, vertical: 'top' };
    ws.getCell(currentRow, 1).font = { size: 9 };
    ws.getRow(currentRow).height = 35;
    currentRow++;
    currentRow++;

    ws.getCell(currentRow, 1).value = 'FECHA';
    ws.getCell(currentRow, 1).font = { bold: true, size: 9 };
    ws.getCell(currentRow, 3).value = 'FIRMA Y SELLO DE LA EMPRESA';
    ws.getCell(currentRow, 3).font = { bold: true, size: 9 };
    currentRow++;
    currentRow++;

    // === XII. PARA USO DE LA DGII ===
    addBlueSection('XII. PARA USO DE LA DGII');
    ws.mergeCells(currentRow, 1, currentRow, 2);
    ws.getCell(currentRow, 1).value = 'FECHA DE PRESENTACIÓN';
    ws.getCell(currentRow, 1).font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    ws.getCell(currentRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    ws.getCell(currentRow, 1).alignment = { horizontal: 'center' };
    ws.mergeCells(currentRow, 3, currentRow, 4);
    ws.getCell(currentRow, 3).value = 'FECHA LÍMITE DE PAGO';
    ws.getCell(currentRow, 3).font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    ws.getCell(currentRow, 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    ws.getCell(currentRow, 3).alignment = { horizontal: 'center' };
    ws.mergeCells(currentRow, 5, currentRow, 6);
    ws.getCell(currentRow, 5).value = 'FECHA DE PAGO';
    ws.getCell(currentRow, 5).font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    ws.getCell(currentRow, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    ws.getCell(currentRow, 5).alignment = { horizontal: 'center' };
    currentRow++;

    // Fila vacía para llenar
    ws.mergeCells(currentRow, 1, currentRow, 2);
    ws.getCell(currentRow, 1).border = { bottom: { style: 'thin' } };
    ws.mergeCells(currentRow, 3, currentRow, 4);
    ws.getCell(currentRow, 3).border = { bottom: { style: 'thin' } };
    ws.mergeCells(currentRow, 5, currentRow, 6);
    ws.getCell(currentRow, 5).border = { bottom: { style: 'thin' } };
    currentRow++;

    // Anchos de columna
    ws.getColumn(1).width = 6;
    ws.getColumn(2).width = 70;
    ws.getColumn(3).width = 5;
    ws.getColumn(4).width = 12;
    ws.getColumn(5).width = 16;
    ws.getColumn(6).width = 5;

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