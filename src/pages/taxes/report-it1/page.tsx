import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { taxService, settingsService } from '../../../services/database';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatMoney } from '../../../utils/numberFormat';
import { addPdfBrandedHeader, getPdfTableStyles } from '../../../utils/exportImportUtils';

interface IT1Data {
  id?: string;
  period: string;
  total_sales: number;
  itbis_collected: number;
  itbis_withheld?: number;
  total_purchases: number;
  itbis_paid: number;
  net_itbis_due: number;
  generated_date: string;
  locked?: boolean;
  locked_at?: string | null;
}

interface IT1Summary {
  totalDeclaraciones: number;
  totalVentasGravadas: number;
  totalITBISCobrado: number;
  totalComprasGravadas: number;
  totalITBISPagado: number;
  saldoNeto: number;
  ultimaDeclaracion: string | null;
}

const periodToLocalDate = (period: string) => {
  const parts = String(period || '').split('-');
  const year = Number(parts[0]) || 0;
  const month = Number(parts[1]) || 0;
  if (!year || !month) return new Date();
  return new Date(year, month - 1, 1);
};

export default function ReportIT1Page() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [reportData, setReportData] = useState<IT1Data | null>(null);
  const [historicalData, setHistoricalData] = useState<IT1Data[]>([]);
  const [, setSummary] = useState<IT1Summary | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);

  useEffect(() => {
    // Set current month as default
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    setSelectedPeriod(currentPeriod);
    setSelectedYear(now.getFullYear().toString());
    
    loadDashboardData();
    loadHistoricalData();

    const loadCompany = async () => {
      const info = await settingsService.getCompanyInfo();
      setCompanyInfo(info);
    };
    loadCompany();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const summaryData = await taxService.getReportIT1Summary();
      setSummary(summaryData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHistoricalData = async () => {
    try {
      const data = await taxService.getReportIT1History(selectedYear || undefined);
      setHistoricalData(data || []);
    } catch (error) {
      console.error('Error loading historical data:', error);
    }
  };

  const generateReport = async () => {
    if (!selectedPeriod) {
      alert('Por favor seleccione un período');
      return;
    }
    
    setGenerating(true);
    try {
      const data = await taxService.generateReportIT1(selectedPeriod);
      setReportData(data);
      setActiveTab('declaration');
      
      // Actualizar datos históricos
      await loadHistoricalData();
      await loadDashboardData();
    } catch (error) {
      console.error('Error generating report IT-1:', error);
      alert('Error al generar el reporte IT-1. Por favor intente nuevamente.');
    } finally {
      setGenerating(false);
    }
  };

  const closeMonth = async () => {
    if (!selectedPeriod) {
      alert('Por favor seleccione un período');
      return;
    }

    const confirmClose = confirm(
      '¿Deseas cerrar el mes? Esto guardará un snapshot del IT-1 para este período.'
    );
    if (!confirmClose) return;

    setSaving(true);
    try {
      const saved = await (taxService as any).closeReportIT1(selectedPeriod, 'normal');
      setReportData(saved);
      await loadHistoricalData();
      await loadDashboardData();
      alert('Mes cerrado: IT-1 guardado correctamente.');
    } catch (error: any) {
      console.error('Error closing IT-1 month:', error);
      alert(error?.message || 'Error al cerrar el mes (guardar IT-1).');
    } finally {
      setSaving(false);
    }
  };

  const lockDeclaration = async () => {
    if (!reportData?.id) {
      alert('Primero debes cerrar el mes para poder bloquearlo.');
      return;
    }
    if (reportData.locked) {
      alert('Este período ya está bloqueado.');
      return;
    }

    const confirmLock = confirm(
      '¿Seguro que deseas BLOQUEAR esta declaración? Luego no se podrá regenerar ni modificar.'
    );
    if (!confirmLock) return;

    setLocking(true);
    try {
      const locked = await (taxService as any).lockReportIT1(reportData.id);
      setReportData(locked);
      await loadHistoricalData();
      await loadDashboardData();
      alert('Declaración bloqueada correctamente.');
    } catch (error: any) {
      console.error('Error locking IT-1:', error);
      alert(error?.message || 'Error al bloquear la declaración IT-1.');
    } finally {
      setLocking(false);
    }
  };

  const exportToExcel = async () => {
    if (!reportData) return;

    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';

    const companyRnc =
      (companyInfo as any)?.rnc ||
      (companyInfo as any)?.tax_id ||
      '';

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('IT-1');

    const blueColor = 'FF008000'; // Azul marino oscuro

    // Helper para agregar sección azul marino
    const addGreenSection = (text: string) => {
      ws.mergeCells(currentRow, 1, currentRow, 3);
      const cell = ws.getCell(currentRow, 1);
      cell.value = text;
      cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      currentRow++;
    };

    // Helper para agregar fila de datos
    const addDataRow = (num: string, desc: string, value: number | string = 0) => {
      ws.getCell(currentRow, 1).value = num;
      ws.getCell(currentRow, 1).alignment = { horizontal: 'center' };
      ws.getCell(currentRow, 2).value = desc;
      ws.getCell(currentRow, 3).value = typeof value === 'number' ? value : value;
      if (typeof value === 'number') {
        ws.getCell(currentRow, 3).numFmt = '#,##0.00';
      }
      ws.getCell(currentRow, 3).alignment = { horizontal: 'right' };
      currentRow++;
    };

    let currentRow = 1;

    // === ENCABEZADO AZUL ===
    ws.mergeCells(currentRow, 1, currentRow, 2);
    const dgiiCell = ws.getCell(currentRow, 1);
    dgiiCell.value = companyName;
    dgiiCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    dgiiCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    dgiiCell.alignment = { horizontal: 'left', vertical: 'middle' };

    ws.getCell(currentRow, 3).value = 'IT-1';
    ws.getCell(currentRow, 3).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    ws.getCell(currentRow, 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    ws.getCell(currentRow, 3).alignment = { horizontal: 'right', vertical: 'middle' };
    currentRow++;

    // Subtítulo
    ws.mergeCells(currentRow, 1, currentRow, 3);
    const subtitleCell = ws.getCell(currentRow, 1);
    subtitleCell.value = 'DECLARACIÓN JURADA Y/O PAGO DEL IMPUESTO SOBRE LAS TRANSFERENCIAS DE BIENES INDUSTRIALIZADOS Y SERVICIOS (ITBIS)';
    subtitleCell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blueColor } };
    subtitleCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    ws.getRow(currentRow).height = 25;
    currentRow++;

    // === I. DATOS GENERALES ===
    addGreenSection('I.    DATOS GENERALES');
    addDataRow('', 'RNC/CÉDULA', companyRnc);
    addDataRow('', 'RAZÓN SOCIAL/NOMBRE', companyName);
    addDataRow('', 'PERIODO (MES/AÑO)', reportData.period.replace('-', '/'));
    currentRow++;

    // === II. INGRESOS POR OPERACIONES ===
    addGreenSection('II.   INGRESOS POR OPERACIONES');
    ws.getCell(currentRow - 1, 3).value = 'MONTO';
    ws.getCell(currentRow - 1, 3).font = { bold: true };
    ws.getCell(currentRow - 1, 3).alignment = { horizontal: 'right' };

    addDataRow('1', 'TOTAL DE OPERACIONES DEL PERIODO (Proviene de la casilla 11 del Anexo A)', reportData.total_sales || 0);
    currentRow++;

    // II.A NO GRAVADAS
    addGreenSection('II.A   NO GRAVADAS');
    addDataRow('2', 'INGRESOS POR EXPORTACIONES DE BIENES SEGÚN Art. 342 CT', (reportData as any).exportaciones_bienes || 0);
    addDataRow('3', 'INGRESOS POR EXPORTACIONES DE SERVICIOS SEGÚN Art. 344 CT y Art. 14 Literal j), Reglamento 293-11', (reportData as any).exportaciones_servicios || 0);
    addDataRow('4', 'INGRESOS POR VENTAS LOCALES DE BIENES O SERVICIOS EXENTOS Art. 343 y Art. 344 CT', (reportData as any).ventas_exentas || 0);
    addDataRow('5', 'INGRESOS POR VENTAS DE BIENES O SERVICIOS EXENTOS POR DESTINO', (reportData as any).ventas_exentas_destino || 0);
    addDataRow('6', 'NO SUJETAS A ITBIS POR SERVICIOS DE CONSTRUCCIÓN (Proviene de la casilla 38 del Anexo A)', 0);
    addDataRow('7', 'NO SUJETAS A ITBIS POR COMISIONES (Proviene de la casilla 42 del Anexo A)', 0);
    addDataRow('8', 'INGRESOS POR VENTAS LOCALES DE BIENES EXENTOS SEGÚN Párrafos III y IV, Art. 343 CT', 0);
    addDataRow('9', 'TOTAL INGRESOS POR OPERACIONES NO GRAVADAS (Sumar casillas 2+3+4+5+6+7+8)', (reportData as any).total_no_gravadas || 0);
    currentRow++;

    // II.B GRAVADAS
    addGreenSection('II.B   GRAVADAS');
    addDataRow('10', 'TOTAL INGRESOS POR OPERACIONES GRAVADAS (Restar casillas 1-9)', (reportData as any).total_gravadas || reportData.total_sales || 0);
    addDataRow('11', 'OPERACIONES GRAVADAS AL 18%', (reportData as any).ventas_gravadas_18 || reportData.total_sales || 0);
    addDataRow('12', 'OPERACIONES GRAVADAS AL 16%', (reportData as any).ventas_gravadas_16 || 0);
    addDataRow('13', 'OPERACIONES GRAVADAS AL 9% (Ley No. 690-16)', 0);
    addDataRow('14', 'OPERACIONES GRAVADAS AL 8% (Ley No. 690-16)', 0);
    addDataRow('15', 'OPERACIONES GRAVADAS POR VENTAS DE ACTIVOS DEPRECIABLES (Categoría 2 y 3)', 0);
    currentRow++;

    // === III. LIQUIDACIÓN ===
    addGreenSection('III.   LIQUIDACIÓN');
    ws.getCell(currentRow - 1, 3).value = 'MONTO';
    ws.getCell(currentRow - 1, 3).font = { bold: true };

    addDataRow('16', 'ITBIS COBRADO (18% de la casilla 11)', reportData.itbis_collected || 0);
    addDataRow('17', 'ITBIS COBRADO (16% de la casilla 12)', 0);
    addDataRow('18', 'ITBIS COBRADO (9% de la casilla 13) (Ley No. 690-16)', 0);
    addDataRow('19', 'ITBIS COBRADO (8% de la casilla 14) (Ley No. 690-16)', 0);
    addDataRow('20', 'ITBIS COBRADO POR VENTAS DE ACTIVOS DEPRECIABLES (Categoría 2 y 3) (18% de la casilla 15)', 0);
    addDataRow('21', 'TOTAL ITBIS COBRADO (Sumar casillas 16+17+18+19+20)', reportData.itbis_collected || 0);
    addDataRow('22', 'ITBIS PAGADO EN COMPRAS LOCALES (Proviene de la casilla 56 del Anexo A)', reportData.itbis_paid || 0);
    addDataRow('23', 'ITBIS PAGADO POR SERVICIOS DEDUCIBLES (Proviene de la casilla 56 del Anexo A)', 0);
    addDataRow('24', 'ITBIS PAGADO EN IMPORTACIONES (Proviene de la casilla 56 del Anexo A)', 0);
    addDataRow('25', 'TOTAL ITBIS DEDUCIBLE (Sumar casillas 22+23+24)', reportData.itbis_paid || 0);
    addDataRow('26', 'IMPUESTO A PAGAR (Si el valor de las casillas 21-25 es Positivo)', reportData.net_itbis_due > 0 ? reportData.net_itbis_due : 0);
    addDataRow('27', 'SALDO A FAVOR (Si el valor de las casillas 21-25 es Negativo)', reportData.net_itbis_due < 0 ? Math.abs(reportData.net_itbis_due) : 0);
    addDataRow('28', 'SALDOS COMPENSABLES AUTORIZADOS (Otros Impuestos) Y/O REEMBOLSOS', 0);
    addDataRow('29', 'SALDO A FAVOR ANTERIOR', 0);
    addDataRow('30', 'TOTAL PAGOS COMPUTABLES POR RETENCIONES (Proviene de la casilla 33 del Anexo A)', 0);
    addDataRow('31', 'OTROS PAGOS COMPUTABLES A CUENTA', 0);
    addDataRow('32', 'COMPENSACIONES Y/O REEMBOLSOS AUTORIZADOS', 0);
    addDataRow('33', 'DIFERENCIA A PAGAR (Si el valor de las casillas 26-28-29-30-31-32 es Positivo)', reportData.net_itbis_due > 0 ? reportData.net_itbis_due : 0);
    addDataRow('34', 'NUEVO SALDO A FAVOR (Si el valor de las casillas (26-28-29-30-31-32 es Negativo) ó (27+28+29+30+31+32))', reportData.net_itbis_due < 0 ? Math.abs(reportData.net_itbis_due) : 0);
    currentRow++;

    // === IV. PENALIDADES ===
    addGreenSection('IV.   PENALIDADES');
    ws.getCell(currentRow - 1, 3).value = 'MONTO';
    ws.getCell(currentRow - 1, 3).font = { bold: true };

    addDataRow('35', 'RECARGOS', 0);
    addDataRow('36', 'INTERÉS INDEMNIZATORIO', 0);
    addDataRow('37', 'SANCIONES', 0);
    currentRow++;

    // === V. MONTO A PAGAR ===
    addGreenSection('V.   MONTO A PAGAR');
    ws.getCell(currentRow - 1, 3).value = 'MONTO';
    ws.getCell(currentRow - 1, 3).font = { bold: true };

    addDataRow('38', 'TOTAL A PAGAR (Sumar casillas 33+35+36+37)', reportData.net_itbis_due > 0 ? reportData.net_itbis_due : 0);
    currentRow++;

    // === A. ITBIS RETENIDO / ITBIS PERCIBIDO ===
    addGreenSection('A.   ITBIS RETENIDO / ITBIS PERCIBIDO');
    ws.getCell(currentRow - 1, 3).value = 'MONTO';
    ws.getCell(currentRow - 1, 3).font = { bold: true };

    addDataRow('39', 'SERVICIOS SUJETOS A RETENCIÓN PERSONAS FÍSICAS', 0);
    addDataRow('40', 'SERVICIOS SUJETOS A RETENCIÓN ENTIDADES NO LUCRATIVAS (Norma No. 01-11)', 0);
    addDataRow('41', 'TOTAL SERVICIOS SUJETOS A RETENCIÓN A PERSONAS FÍSICAS Y ENTIDADES NO LUCRATIVAS', 0);
    addDataRow('42', 'SERVICIOS SUJETOS A RETENCIÓN SOCIEDADES (Norma No. 07-09)', 0);
    addDataRow('43', 'SERVICIOS SUJETOS A RETENCIÓN SOCIEDADES (Norma No. 02-05 y 07-07)', 0);
    addDataRow('44', 'BIENES O SERVICIOS SUJETOS A RETENCIÓN A CONTRIBUYENTES ACOGIDOS AL RST (Operaciones Gravadas al 18%)', 0);
    addDataRow('45', 'BIENES O SERVICIOS SUJETOS A RETENCIÓN A CONTRIBUYENTES ACOGIDOS AL RST (Operaciones Gravadas al 16%)', 0);
    addDataRow('46', 'TOTAL BIENES O SERVICIOS SUJETOS A RETENCIÓN A CONTRIBUYENTES ACOGIDOS AL RST (Sumar casillas 44+45)', 0);
    addDataRow('47', 'BIENES SUJETOS A RETENCIÓN DE COMPROBANTE DE COMPRAS (Operaciones Gravadas al 18%) (Norma No. 08-10 y 05-19)', 0);
    addDataRow('48', 'BIENES SUJETOS A RETENCIÓN DE COMPROBANTE DE COMPRAS (Operaciones Gravadas al 16%) (Norma No. 08-10 y 05-19)', 0);
    addDataRow('49', 'TOTAL BIENES SUJETOS A RETENCIÓN COMPROBANTES DE COMPRAS (Sumar casillas 47+48)', 0);
    addDataRow('50', 'ITBIS POR SERVICIOS SUJETOS A RETENCIÓN PERSONAS FÍSICAS Y ENTIDADES NO LUCRATIVAS (18% de la casilla 41)', 0);
    addDataRow('51', 'ITBIS POR SERVICIOS SUJETOS A RETENCIÓN SOCIEDADES (18% de la casilla 42) (Norma No. 07-09)', 0);
    addDataRow('52', 'ITBIS POR SERVICIOS SUJETOS A RETENCIÓN SOCIEDADES (18% de la casilla 43 por 0.30) (Norma No. 02-05 y 07-07)', 0);
    addDataRow('53', 'ITBIS RETENIDO A CONTRIBUYENTES ACOGIDOS AL RST (18% de la casilla 44)', 0);
    addDataRow('54', 'ITBIS RETENIDO A CONTRIBUYENTES ACOGIDOS AL RST (16% de la casilla 45)', 0);
    addDataRow('55', 'TOTAL ITBIS RETENIDO A CONTRIBUYENTES ACOGIDOS AL RST (Sumar casillas 53+54)', 0);
    addDataRow('56', 'ITBIS POR BIENES SUJETOS A RETENCIÓN DE COMPROBANTE DE COMPRAS (18% de la casilla 47) (Norma No. 08-10 y 05-19)', 0);
    addDataRow('57', 'ITBIS POR BIENES SUJETOS A RETENCIÓN DE COMPROBANTE DE COMPRAS (16% de la casilla 48) (Norma No. 08-10 y 05-19)', 0);
    addDataRow('58', 'TOTAL POR BIENES SUJETOS A RETENCIÓN COMPROBANTE DE COMPRAS (Sumar casillas 56+57)', 0);
    addDataRow('59', 'TOTAL ITBIS PERCIBIDO EN VENTA', 0);
    addDataRow('60', 'IMPUESTO A PAGAR (Sumar casillas 50+51+52+55+58+59)', 0);
    addDataRow('61', 'PAGOS COMPUTABLES A CUENTA', 0);
    addDataRow('62', 'DIFERENCIA A PAGAR (Si el valor de las casillas 60-61 es Positivo)', 0);
    addDataRow('63', 'NUEVO SALDO A FAVOR (Si el valor de las casillas 60-61 es Negativo)', 0);
    currentRow++;

    // === B. PENALIDADES ===
    addGreenSection('B.   PENALIDADES');
    addDataRow('64', 'RECARGOS', 0);
    addDataRow('65', 'INTERÉS INDEMNIZATORIO', 0);
    addDataRow('66', 'SANCIONES', 0);
    currentRow++;

    // === C. MONTO A PAGAR ===
    addGreenSection('C.   MONTO A PAGAR');
    ws.getCell(currentRow - 1, 3).value = 'MONTO';
    ws.getCell(currentRow - 1, 3).font = { bold: true };

    addDataRow('67', 'TOTAL A PAGAR (Sumar casillas 62+64+65+66)', 0);
    currentRow++;

    // === TOTAL GENERAL ===
    addGreenSection('68   TOTAL GENERAL (Sumar casillas 38+67)');
    ws.getCell(currentRow, 1).value = '';
    ws.getCell(currentRow, 2).value = 'TOTAL';
    ws.getCell(currentRow, 2).font = { bold: true };
    ws.getCell(currentRow, 3).value = reportData.net_itbis_due > 0 ? reportData.net_itbis_due : 0;
    ws.getCell(currentRow, 3).numFmt = '#,##0.00';
    ws.getCell(currentRow, 3).font = { bold: true, size: 12 };
    ws.getCell(currentRow, 3).alignment = { horizontal: 'right' };
    currentRow++;
    currentRow++;

    // === JURAMENTO ===
    addGreenSection('JURAMENTO');
    ws.mergeCells(currentRow, 1, currentRow, 3);
    ws.getCell(currentRow, 1).value = 'Yo, ________________________________ en mi calidad de ________________ por la presente afirmo bajo juramento que los datos consignados en la presente declaración son correctos y completos y que no he omitido ni falseado dato alguno que la misma deba contener, siendo en consecuencia todo su contenido la fiel expresión de la verdad.';
    ws.getCell(currentRow, 1).alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(currentRow).height = 40;
    currentRow++;
    currentRow++;

    ws.getCell(currentRow, 1).value = 'Fecha';
    ws.getCell(currentRow, 2).value = 'Firma';
    currentRow++;
    currentRow++;

    // === PARA USO DE LA DGII ===
    addGreenSection('PARA USO DE LA DGII');
    ws.getCell(currentRow, 1).value = 'Fecha de Pago';
    ws.getCell(currentRow, 2).value = 'No. Recibo de Pago';
    ws.getCell(currentRow, 3).value = 'Fecha Límite de Pago';
    currentRow++;

    // Anchos de columna
    ws.getColumn(1).width = 10;
    ws.getColumn(2).width = 90;
    ws.getColumn(3).width = 18;

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `declaracion_it1_${reportData.period}.xlsx`);
  };

  const exportToCSV = () => {
    if (!reportData) return;
    const separator = ';';

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

    headerLines.push(['Reporte', 'Declaración Jurada del ITBIS (IT-1)'].join(separator));
    headerLines.push([
      'Período',
      periodToLocalDate(reportData.period).toLocaleDateString('es-DO', { year: 'numeric', month: 'long' }),
    ].join(separator));
    headerLines.push('');

    const csvContent = [
      ...headerLines,
      ['Campo', 'Valor'].join(separator),
      ['Período', periodToLocalDate(reportData.period).toLocaleDateString('es-DO', { year: 'numeric', month: 'long' })].join(separator),
      ['Total Ventas Gravadas', formatMoney(reportData.total_sales)].join(separator),
      ['ITBIS Cobrado', formatMoney(reportData.itbis_collected)].join(separator),
      ['Total Compras Gravadas', formatMoney(reportData.total_purchases)].join(separator),
      ['ITBIS Pagado', formatMoney(reportData.itbis_paid)].join(separator),
      ['ITBIS Neto a Pagar', formatMoney(reportData.net_itbis_due)].join(separator),
      ['Fecha de Generación', new Date(reportData.generated_date).toLocaleDateString('es-DO')].join(separator),
    ].join('\n');

    const csvForExcel = '\uFEFF' + csvContent.replace(/\n/g, '\r\n');
    const blob = new Blob([csvForExcel], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `declaracion_it1_${reportData.period}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = async () => {
    if (!reportData) return;
    const doc = new jsPDF();
    const pdfStyles = getPdfTableStyles();

    // Add branded header with logo
    const startY = await addPdfBrandedHeader(doc, 'Declaración Jurada del ITBIS (IT-1)', {
      subtitle: `Período: ${periodToLocalDate(reportData.period).toLocaleDateString('es-DO', { year: 'numeric', month: 'long' })}`
    });

    // Sección I - Ventas
    doc.setFontSize(12);
    doc.setTextColor(51, 51, 51);
    doc.text('I. Ventas y Servicios Gravados', 14, startY);

    (doc as any).autoTable({
      startY: startY + 5,
      head: [['Concepto', 'Valor']],
      body: [
        ['Total de Ventas y Servicios Gravados', formatMoney(reportData.total_sales)],
        ['ITBIS Cobrado en Ventas', formatMoney(reportData.itbis_collected)],
      ],
      theme: 'grid',
      ...pdfStyles,
    });

    // Sección II - Compras
    const afterSalesY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.text('II. Compras y Gastos Gravados', 14, afterSalesY);

    (doc as any).autoTable({
      startY: afterSalesY + 5,
      head: [['Concepto', 'Valor']],
      body: [
        ['Total de Compras y Gastos Gravados', formatMoney(reportData.total_purchases)],
        ['ITBIS Pagado en Compras', formatMoney(reportData.itbis_paid)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [0, 128, 0] },
    });

    // Sección III - Liquidación
    const afterPurchasesY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.text('III. Liquidación del Impuesto', 14, afterPurchasesY);

    const netLabel = reportData.net_itbis_due >= 0 ? 'ITBIS Neto a Pagar' : 'Saldo a Favor';
    const netValue = formatMoney(Math.abs(reportData.net_itbis_due));

    (doc as any).autoTable({
      startY: afterPurchasesY + 5,
      head: [['Concepto', 'Valor']],
      body: [
        ['ITBIS Cobrado en Ventas', formatMoney(reportData.itbis_collected)],
        ['(-) ITBIS Pagado en Compras', formatMoney(reportData.itbis_paid)],
        [netLabel, netValue],
      ],
      theme: 'grid',
      headStyles: { fillColor: [0, 128, 0] },
    });

    doc.save(`declaracion_it1_${reportData.period}.pdf`);
  };

  const exportToTXT = () => {
    if (!reportData) return;
    
    const content = `
DECLARACIÓN JURADA DEL ITBIS (IT-1)
===================================

Período: ${periodToLocalDate(reportData.period).toLocaleDateString('es-DO', { year: 'numeric', month: 'long' })}

I. VENTAS Y SERVICIOS GRAVADOS
------------------------------
Total de Ventas y Servicios Gravados: ${formatMoney(reportData.total_sales)}
ITBIS Cobrado en Ventas: ${formatMoney(reportData.itbis_collected)}

II. COMPRAS Y GASTOS GRAVADOS
-----------------------------
Total de Compras y Gastos Gravados: ${formatMoney(reportData.total_purchases)}
ITBIS Pagado en Compras: ${formatMoney(reportData.itbis_paid)}

III. LIQUIDACIÓN DEL IMPUESTO
-----------------------------
ITBIS Cobrado en Ventas: ${formatMoney(reportData.itbis_collected)}
(-) ITBIS Pagado en Compras: ${formatMoney(reportData.itbis_paid)}
ITBIS NETO A PAGAR: ${formatMoney(reportData.net_itbis_due)}

Generado el: ${new Date(reportData.generated_date).toLocaleDateString('es-DO')} a las ${new Date(reportData.generated_date).toLocaleTimeString('es-DO')}

---
Sistema de Contabilidad - República Dominicana
Cumple con las normativas de la DGII
    `;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `declaracion_it1_${reportData.period}.txt`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportHistoricalToCSV = () => {
    if (filteredHistoricalData.length === 0) return;
    
    const separator = ';';

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

    headerLines.push(['Reporte', 'Historial Declaración IT-1 (ITBIS)'].join(separator));
    headerLines.push(['Año', selectedYear || 'Todos los años'].join(separator));
    headerLines.push('');

    const csvLines = [
      ...headerLines,
      ['Período', 'Total Ventas', 'ITBIS Cobrado', 'Total Compras', 'ITBIS Pagado', 'ITBIS Neto', 'Fecha Generación'].join(separator),
      ...filteredHistoricalData.map(record => [
        new Date(record.period + '-01').toLocaleDateString('es-DO', { year: 'numeric', month: 'long' }),
        formatMoney(record.total_sales),
        formatMoney(record.itbis_collected),
        formatMoney(record.total_purchases),
        formatMoney(record.itbis_paid),
        formatMoney(record.net_itbis_due),
        new Date(record.generated_date).toLocaleDateString('es-DO')
      ].join(separator)),
    ];

    const csvContent = csvLines.join('\n');

    const blob = new Blob(['\uFEFF' + csvContent.replace(/\n/g, '\r\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `historial_it1_${selectedYear || 'todos'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredHistoricalData = historicalData.filter(record => {
    const matchesSearch = !searchTerm || 
      record.period.toLowerCase().includes(searchTerm.toLowerCase()) ||
      periodToLocalDate(record.period).toLocaleDateString('es-DO', { year: 'numeric', month: 'long' }).toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesYear = !selectedYear || record.period.startsWith(selectedYear);
    
    return matchesSearch && matchesYear;
  });

  const getMonthName = (period: string) => {
    return periodToLocalDate(period).toLocaleDateString('es-DO', { year: 'numeric', month: 'long' });
  };

  const formatCurrency = (amount: number) => {
    return formatMoney(amount);
  };

  const getStatusColor = (amount: number) => {
    if (amount > 0) return 'text-red-600';
    if (amount < 0) return 'text-green-600';
    return 'text-gray-600';
  };

  const getStatusText = (amount: number) => {
    if (amount > 0) return 'A Pagar';
    if (amount < 0) return 'Saldo a Favor';
    return 'Sin Saldo';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reporte IT-1</h1>
            <p className="text-gray-600">Declaración Jurada Mensual del ITBIS</p>
          </div>
          <button
            onClick={() => navigate('/taxes')}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-arrow-left-line mr-2"></i>
            Volver a Impuestos
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'dashboard'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="ri-dashboard-line mr-2"></i>
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('declaration')}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'declaration'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="ri-file-text-line mr-2"></i>
                Generar Declaración
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'history'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="ri-history-line mr-2"></i>
                Historial
              </button>
            </nav>
          </div>

          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div className="p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Resumen Ejecutivo IT-1</h3>
                
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <i className="ri-loader-4-line animate-spin text-2xl text-blue-600 mr-3"></i>
                    <span className="text-gray-600">Cargando estadísticas...</span>
                  </div>
                ) : (
                  <>
                    {/* Main Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                      <div className="bg-blue-50 rounded-lg p-6">
                        <div className="flex items-center">
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-blue-100">
                            <i className="ri-file-list-3-line text-xl text-blue-600"></i>
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600">Total Declaraciones</p>
                            <p className="text-2xl font-bold text-blue-600">{historicalData.length}</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-green-50 rounded-lg p-6">
                        <div className="flex items-center">
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-green-100">
                            <i className="ri-money-dollar-circle-line text-xl text-green-600"></i>
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600">ITBIS Cobrado Total</p>
                            <p className="text-2xl font-bold text-green-600">
                              {formatCurrency(historicalData.reduce((sum, item) => sum + item.itbis_collected, 0))}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-orange-50 rounded-lg p-6">
                        <div className="flex items-center">
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-orange-100">
                            <i className="ri-shopping-cart-line text-xl text-orange-600"></i>
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600">ITBIS Pagado Total</p>
                            <p className="text-2xl font-bold text-orange-600">
                              {formatCurrency(historicalData.reduce((sum, item) => sum + item.itbis_paid, 0))}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-red-50 rounded-lg p-6">
                        <div className="flex items-center">
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-red-100">
                            <i className="ri-calculator-line text-xl text-red-600"></i>
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600">ITBIS Neto Total</p>
                            <p className="text-2xl font-bold text-red-600">
                              {formatCurrency(historicalData.reduce((sum, item) => sum + item.net_itbis_due, 0))}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Recent Declarations */}
                    <div className="bg-gray-50 rounded-lg p-6">
                      <h4 className="text-md font-semibold text-gray-900 mb-4">Últimas Declaraciones</h4>
                      <div className="space-y-3">
                        {historicalData.slice(0, 5).map((record) => (
                          <div key={record.id} className="flex items-center justify-between bg-white p-4 rounded-lg">
                            <div className="flex items-center">
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100">
                                <i className="ri-calendar-line text-blue-600"></i>
                              </div>
                              <div className="ml-3">
                                <p className="font-medium text-gray-900">{getMonthName(record.period)}</p>
                                <p className="text-sm text-gray-500">
                                  Generado: {new Date(record.generated_date).toLocaleDateString('es-DO')}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-semibold ${getStatusColor(record.net_itbis_due)}`}>
                                {formatCurrency(Math.abs(record.net_itbis_due))}
                              </p>
                              <p className="text-sm text-gray-500">{getStatusText(record.net_itbis_due)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Declaration Tab */}
          {activeTab === 'declaration' && (
            <div className="p-6">
              {/* Controls */}
              <div className="bg-gray-50 rounded-lg p-6 mb-6">
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
                            <i className="ri-calendar-check-line mr-2"></i>
                            Generar Declaración
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  {reportData && (
                    <div className="flex space-x-2">
                      <button
                        onClick={closeMonth}
                        disabled={saving || reportData?.locked}
                        className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {saving ? (
                          <>
                            <i className="ri-loader-4-line animate-spin mr-2"></i>
                            Guardando...
                          </>
                        ) : (
                          <>
                            <i className="ri-lock-unlock-line mr-2"></i>
                            Cerrar mes
                          </>
                        )}
                      </button>

                      <button
                        onClick={lockDeclaration}
                        disabled={locking || !reportData?.id || reportData?.locked}
                        className="bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-black transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {locking ? (
                          <>
                            <i className="ri-loader-4-line animate-spin mr-2"></i>
                            Bloqueando...
                          </>
                        ) : (
                          <>
                            <i className="ri-lock-line mr-2"></i>
                            Bloquear
                          </>
                        )}
                      </button>

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
                        <i className="ri-file-excel-line mr-2"></i>
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
                        onClick={exportToPDF}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                      >
                        <i className="ri-file-pdf-line mr-2"></i>
                        Exportar PDF
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Declaration Form */}
              {reportData && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-6 border-b border-gray-200 bg-blue-50">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <h3 className="text-lg font-semibold text-gray-900">
                      Declaración Jurada del ITBIS (IT-1) - {getMonthName(reportData.period)}
                      </h3>

                      <div className="flex items-center gap-2">
                        {reportData.locked ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-900 text-white">
                            Bloqueado
                          </span>
                        ) : reportData.id ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                            Cerrado (guardado)
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                            Preview (no guardado)
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Formulario oficial según normativas de la DGII
                    </p>
                  </div>
                  <div className="p-6 space-y-8">
                    {/* Sales Section */}
                    <div>
                      <h4 className="text-md font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">
                        I. VENTAS Y SERVICIOS GRAVADOS
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Total de Ventas y Servicios Gravados
                          </label>
                          <div className="text-2xl font-bold text-blue-600">
                            {formatCurrency(reportData.total_sales)}
                          </div>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            ITBIS Cobrado en Ventas
                          </label>
                          <div className="text-2xl font-bold text-green-600">
                            {formatCurrency(reportData.itbis_collected)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Purchases Section */}
                    <div>
                      <h4 className="text-md font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">
                        II. COMPRAS Y GASTOS GRAVADOS
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-orange-50 p-4 rounded-lg">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Total de Compras y Gastos Gravados
                          </label>
                          <div className="text-2xl font-bold text-orange-600">
                            {formatCurrency(reportData.total_purchases)}
                          </div>
                        </div>
                        <div className="bg-purple-50 p-4 rounded-lg">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            ITBIS Pagado en Compras
                          </label>
                          <div className="text-2xl font-bold text-purple-600">
                            {formatCurrency(reportData.itbis_paid)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Calculation Section */}
                    <div>
                      <h4 className="text-md font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">
                        III. LIQUIDACIÓN DEL IMPUESTO
                      </h4>
                      <div className="bg-gray-50 p-6 rounded-lg">
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-700">ITBIS Cobrado en Ventas:</span>
                            <span className="font-semibold">{formatCurrency(reportData.itbis_collected)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-700">(-) ITBIS Retenido por Clientes:</span>
                            <span className="font-semibold">{formatCurrency(reportData.itbis_withheld || 0)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-700">(-) ITBIS Pagado en Compras:</span>
                            <span className="font-semibold">{formatCurrency(reportData.itbis_paid)}</span>
                          </div>
                          <div className="border-t border-gray-300 pt-4">
                            <div className="flex justify-between items-center">
                              <span className="text-lg font-semibold text-gray-900">
                                {reportData.net_itbis_due >= 0 ? 'ITBIS a Pagar:' : 'Saldo a Favor:'}
                              </span>
                              <span className={`text-2xl font-bold ${getStatusColor(reportData.net_itbis_due)}`}>
                                {formatCurrency(Math.abs(reportData.net_itbis_due))}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-white border-2 border-blue-200 rounded-lg p-6 text-center">
                        <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-blue-100 mx-auto mb-4">
                          <i className="ri-money-dollar-circle-line text-xl text-blue-600"></i>
                        </div>
                        <h5 className="text-sm font-medium text-gray-600 mb-2">Total Ventas</h5>
                        <p className="text-xl font-bold text-blue-600">
                          {formatCurrency(reportData.total_sales)}
                        </p>
                      </div>
                      <div className="bg-white border-2 border-green-200 rounded-lg p-6 text-center">
                        <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-green-100 mx-auto mb-4">
                          <i className="ri-percent-line text-xl text-green-600"></i>
                        </div>
                        <h5 className="text-sm font-medium text-gray-600 mb-2">ITBIS Cobrado</h5>
                        <p className="text-xl font-bold text-green-600">
                          {formatCurrency(reportData.itbis_collected)}
                        </p>
                      </div>
                      <div className="bg-white border-2 border-red-200 rounded-lg p-6 text-center">
                        <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-red-100 mx-auto mb-4">
                          <i className="ri-calculator-line text-xl text-red-600"></i>
                        </div>
                        <h5 className="text-sm font-medium text-gray-600 mb-2">
                          {reportData.net_itbis_due >= 0 ? 'ITBIS a Pagar' : 'Saldo a Favor'}
                        </h5>
                        <p className={`text-xl font-bold ${getStatusColor(reportData.net_itbis_due)}`}>
                          {formatCurrency(Math.abs(reportData.net_itbis_due))}
                        </p>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="text-center text-sm text-gray-500 border-t border-gray-200 pt-4">
                      Declaración generada el {new Date(reportData.generated_date).toLocaleDateString('es-DO')} a las {new Date(reportData.generated_date).toLocaleTimeString('es-DO')}
                      {reportData.locked && reportData.locked_at ? (
                        <>
                          <br />
                          Bloqueado el {new Date(reportData.locked_at).toLocaleDateString('es-DO')}
                        </>
                      ) : null}
                      <br />
                      <span className="text-xs">Sistema de Contabilidad - Cumple con normativas DGII</span>
                    </div>
                  </div>
                </div>
              )}

              {/* No Data Message */}
              {!reportData && !generating && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                  <div className="w-16 h-16 rounded-lg flex items-center justify-center bg-gray-100 mx-auto mb-4">
                    <i className="ri-calendar-check-line text-2xl text-gray-400"></i>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay declaración generada</h3>
                  <p className="text-gray-600 mb-4">Seleccione un período y genere la declaración IT-1</p>
                  <button
                    onClick={generateReport}
                    disabled={!selectedPeriod}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    <i className="ri-add-line mr-2"></i>
                    Generar Primera Declaración
                  </button>
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="p-6">
              {/* Filters */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Buscar
                      </label>
                      <input
                        type="text"
                        placeholder="Buscar por período..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Año
                      </label>
                      <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Todos los años</option>
                        <option value="2024">2024</option>
                        <option value="2023">2023</option>
                        <option value="2022">2022</option>
                      </select>
                    </div>
                    <div className="pt-6">
                      <span className="text-sm text-gray-600">
                        {filteredHistoricalData.length} declaraciones encontradas
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={exportHistoricalToCSV}
                    disabled={filteredHistoricalData.length === 0}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <i className="ri-download-line mr-2"></i>
                    Exportar Historial
                  </button>
                </div>
              </div>

              {/* Historical Data Table */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Período
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Ventas
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          ITBIS Cobrado
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          ITBIS Pagado
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          ITBIS Neto
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Estado
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Fecha Generación
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredHistoricalData.map((record) => (
                        <tr key={record.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-100">
                                <i className="ri-calendar-line text-blue-600"></i>
                              </div>
                              <div className="ml-3">
                                <div className="text-sm font-medium text-gray-900">
                                  {getMonthName(record.period)}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(record.total_sales)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                            {formatCurrency(record.itbis_collected)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-600 font-medium">
                            {formatCurrency(record.itbis_paid)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <span className={getStatusColor(record.net_itbis_due)}>
                              {formatCurrency(Math.abs(record.net_itbis_due))}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                record.net_itbis_due > 0 
                                  ? 'bg-red-100 text-red-800' 
                                  : record.net_itbis_due < 0 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {getStatusText(record.net_itbis_due)}
                              </span>
                              {record.locked ? (
                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-900 text-white w-fit">
                                  Bloqueado
                                </span>
                              ) : (
                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 w-fit">
                                  Cerrado
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(record.generated_date).toLocaleDateString('es-DO')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredHistoricalData.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-lg flex items-center justify-center bg-gray-100 mx-auto mb-4">
                      <i className="ri-search-line text-2xl text-gray-400"></i>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No se encontraron declaraciones</h3>
                    <p className="text-gray-600">Intente ajustar los filtros de búsqueda</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
