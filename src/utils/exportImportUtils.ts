import { read, utils, writeFile } from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { settingsService } from '../services/database';
import { formatAmount } from './numberFormat';

// ============================================================================
// BRAND COLORS - Unified theme for all reports
// ============================================================================
export const REPORT_COLORS = {
  // Primary green (brand color)
  primary: '008000',
  primaryRGB: [0, 128, 0] as [number, number, number],
  // Light green for alternating rows
  primaryLight: 'E8F5E9',
  primaryLightRGB: [232, 245, 233] as [number, number, number],
  // Dark green for accents
  primaryDark: '006600',
  primaryDarkRGB: [0, 102, 0] as [number, number, number],
  // White
  white: 'FFFFFF',
  whiteRGB: [255, 255, 255] as [number, number, number],
  // Text colors
  textDark: '333333',
  textDarkRGB: [51, 51, 51] as [number, number, number],
  textMuted: '666666',
  textMutedRGB: [102, 102, 102] as [number, number, number],
  // Border
  border: 'E5E7EB',
  borderRGB: [229, 231, 235] as [number, number, number],
};

// ============================================================================
// EXCEL STYLES - Reusable style configurations
// ============================================================================
export const EXCEL_STYLES = {
  headerFill: {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: `FF${REPORT_COLORS.primary}` },
  },
  headerFont: {
    bold: true,
    color: { argb: `FF${REPORT_COLORS.white}` },
    size: 11,
  },
  titleFont: {
    bold: true,
    size: 16,
    color: { argb: `FF${REPORT_COLORS.primary}` },
  },
  subtitleFont: {
    bold: true,
    size: 12,
    color: { argb: `FF${REPORT_COLORS.textDark}` },
  },
  alternateRowFill: {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: `FF${REPORT_COLORS.primaryLight}` },
  },
};

// ============================================================================
// HELPER: Get company info with logo
// ============================================================================
export const getCompanyInfoForReports = async (): Promise<{
  name: string;
  rnc: string;
  phone: string;
  email: string;
  address: string;
  logo: string;
}> => {
  try {
    const info = await settingsService.getCompanyInfo();
    if (info) {
      return {
        name: (info as any).name || (info as any).company_name || 'Send Bill Now',
        rnc: (info as any).rnc || (info as any).tax_id || '',
        phone: (info as any).phone || '',
        email: (info as any).email || '',
        address: (info as any).address || '',
        logo: (info as any).logo || '',
      };
    }
  } catch (error) {
    console.error('Error getting company info for reports:', error);
  }
  return { name: 'Send Bill Now', rnc: '', phone: '', email: '', address: '', logo: '' };
};

// ============================================================================
// HELPER: Add branded header to Excel worksheet with logo
// ============================================================================
export const addExcelBrandedHeader = async (
  ws: ExcelJS.Worksheet,
  wb: ExcelJS.Workbook,
  reportTitle: string,
  totalColumns: number,
  options?: { periodText?: string; subtitle?: string }
): Promise<number> => {
  const company = await getCompanyInfoForReports();
  let currentRow = 1;

  // Add logo if available
  if (company.logo && company.logo.startsWith('data:image')) {
    try {
      const imageId = wb.addImage({
        base64: company.logo,
        extension: 'png',
      });
      ws.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: 80, height: 80 },
      });
      // Reserve space for logo
      ws.getRow(1).height = 25;
      ws.getRow(2).height = 25;
      ws.getRow(3).height = 25;
      currentRow = 1;
    } catch (e) {
      console.warn('Could not add logo to Excel:', e);
    }
  }

  // Company name (centered, green)
  ws.mergeCells(currentRow, 1, currentRow, totalColumns);
  const companyCell = ws.getCell(currentRow, 1);
  companyCell.value = company.name;
  companyCell.font = EXCEL_STYLES.titleFont;
  companyCell.alignment = { horizontal: 'center', vertical: 'middle' };
  currentRow++;

  // Report title (centered)
  ws.mergeCells(currentRow, 1, currentRow, totalColumns);
  const titleCell = ws.getCell(currentRow, 1);
  titleCell.value = reportTitle;
  titleCell.font = EXCEL_STYLES.subtitleFont;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  currentRow++;

  // Subtitle if provided
  if (options?.subtitle) {
    ws.mergeCells(currentRow, 1, currentRow, totalColumns);
    const subtitleCell = ws.getCell(currentRow, 1);
    subtitleCell.value = options.subtitle;
    subtitleCell.font = { size: 10, color: { argb: `FF${REPORT_COLORS.textMuted}` } };
    subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;
  }

  // Period or date
  ws.mergeCells(currentRow, 1, currentRow, totalColumns);
  const dateCell = ws.getCell(currentRow, 1);
  dateCell.value = options?.periodText || `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
  dateCell.font = { size: 9, italic: true, color: { argb: `FF${REPORT_COLORS.textMuted}` } };
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
  currentRow++;

  // Empty row before data
  currentRow++;

  return currentRow;
};

// ============================================================================
// HELPER: Apply branded header row style to Excel
// ============================================================================
export const applyExcelHeaderStyle = (row: ExcelJS.Row) => {
  row.eachCell((cell) => {
    cell.font = EXCEL_STYLES.headerFont;
    cell.fill = EXCEL_STYLES.headerFill as ExcelJS.Fill;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: `FF${REPORT_COLORS.primaryDark}` } },
      bottom: { style: 'thin', color: { argb: `FF${REPORT_COLORS.primaryDark}` } },
    };
  });
};

// ============================================================================
// HELPER: Apply alternating row colors to Excel data
// ============================================================================
export const applyExcelAlternatingRows = (ws: ExcelJS.Worksheet, startRow: number, endRow: number) => {
  for (let i = startRow; i <= endRow; i++) {
    if ((i - startRow) % 2 === 1) {
      ws.getRow(i).eachCell((cell) => {
        cell.fill = EXCEL_STYLES.alternateRowFill as ExcelJS.Fill;
      });
    }
  }
};

// ============================================================================
// HELPER: Add branded header to PDF with logo
// ============================================================================
export const addPdfBrandedHeader = async (
  doc: jsPDF,
  reportTitle: string,
  options?: { subtitle?: string; periodText?: string }
): Promise<number> => {
  const company = await getCompanyInfoForReports();
  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 15;

  // Add logo if available (centered)
  if (company.logo && company.logo.startsWith('data:image')) {
    try {
      const logoWidth = 25;
      const logoHeight = 25;
      const logoX = (pageWidth - logoWidth) / 2;
      doc.addImage(company.logo, 'PNG', logoX, currentY - 10, logoWidth, logoHeight);
      currentY += logoHeight + 5;
    } catch (e) {
      console.warn('Could not add logo to PDF:', e);
    }
  }

  // Company name (centered, green)
  doc.setFontSize(18);
  doc.setTextColor(...REPORT_COLORS.primaryRGB);
  doc.setFont('helvetica', 'bold');
  doc.text(company.name, pageWidth / 2, currentY, { align: 'center' });
  currentY += 6;

  // RNC if available
  if (company.rnc) {
    doc.setFontSize(9);
    doc.setTextColor(...REPORT_COLORS.textMutedRGB);
    doc.setFont('helvetica', 'normal');
    doc.text(`RNC: ${company.rnc}`, pageWidth / 2, currentY, { align: 'center' });
    currentY += 5;
  }

  // Report title
  doc.setFontSize(14);
  doc.setTextColor(...REPORT_COLORS.textDarkRGB);
  doc.setFont('helvetica', 'bold');
  doc.text(reportTitle, pageWidth / 2, currentY, { align: 'center' });
  currentY += 5;

  // Subtitle if provided
  if (options?.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(...REPORT_COLORS.textMutedRGB);
    doc.setFont('helvetica', 'normal');
    doc.text(options.subtitle, pageWidth / 2, currentY, { align: 'center' });
    currentY += 5;
  }

  // Date/Period
  doc.setFontSize(9);
  doc.setTextColor(...REPORT_COLORS.textMutedRGB);
  doc.setFont('helvetica', 'italic');
  const dateText = options?.periodText || `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
  doc.text(dateText, pageWidth / 2, currentY, { align: 'center' });
  currentY += 4;

  // Green divider line
  doc.setDrawColor(...REPORT_COLORS.primaryRGB);
  doc.setLineWidth(1);
  doc.line(14, currentY, pageWidth - 14, currentY);
  currentY += 8;

  return currentY;
};

// ============================================================================
// HELPER: Get PDF autoTable styles with brand colors
// ============================================================================
export const getPdfTableStyles = () => ({
  headStyles: {
    fillColor: REPORT_COLORS.primaryRGB,
    textColor: REPORT_COLORS.whiteRGB,
    fontStyle: 'bold' as const,
    fontSize: 9,
  },
  bodyStyles: {
    fontSize: 8,
    textColor: REPORT_COLORS.textDarkRGB,
  },
  alternateRowStyles: {
    fillColor: REPORT_COLORS.primaryLightRGB,
  },
  styles: {
    lineColor: REPORT_COLORS.borderRGB,
    lineWidth: 0.1,
    cellPadding: 3,
  },
});

export const exportToExcel = (data: any[], fileName: string) => {
  try {
    const ws = utils.json_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Datos');
    writeFile(wb, `${fileName}.xlsx`);
  } catch (error) {
    console.error('Error al exportar a Excel:', error);
    throw error;
  }
};

// Styled Excel export using ExcelJS (supports header styles, widths, number formats, autofilter, freeze)
export const exportToExcelStyled = async (
  rows: any[],
  columns: Array<{ key: string; title: string; width?: number; numFmt?: string }>,
  fileBaseName: string,
  sheetName: string = 'Datos'
) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);

  const totalColumns = Math.max(1, columns.length);
  
  // Use branded header with logo
  let currentRow = await addExcelBrandedHeader(ws, wb, sheetName, totalColumns);

  // Columnas (sin header automático; el header lo pintamos manual)
  ws.columns = columns.map(col => ({ key: col.key, width: col.width || 14 }));

  // Header row (cabecera de columnas) - GREEN branded
  const headerRowIndex = currentRow;
  const header = ws.getRow(headerRowIndex);
  columns.forEach((col, idx) => {
    const cell = header.getCell(idx + 1);
    cell.value = col.title;
  });
  applyExcelHeaderStyle(header);
  currentRow++;

  // Freeze panes at header row
  ws.views = [{ state: 'frozen', ySplit: headerRowIndex }];

  // Data rows
  const dataStartRow = currentRow;
  rows.forEach(row => {
    const values: Record<string, any> = {};
    columns.forEach(col => {
      values[col.key] = row[col.key];
    });
    ws.addRow(values);
  });

  // Apply alternating row colors
  applyExcelAlternatingRows(ws, dataStartRow, ws.rowCount);

  // Number formats per column
  columns.forEach((col, idx) => {
    if (col.numFmt) {
      const colIndex = idx + 1;
      for (let r = 2; r <= ws.rowCount; r++) {
        const cell = ws.getRow(r).getCell(colIndex);
        if (typeof cell.value === 'number') {
          cell.numFmt = col.numFmt;
        }
      }
    }
  });

  // Autofilter across header range
  ws.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: headerRowIndex, column: columns.length }
  } as any;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${fileBaseName}.xlsx`);
};

export const exportToExcelWithHeaders = async (
  rows: any[],
  headers: { key: string; title: string }[],
  fileName: string,
  sheetName: string = 'Datos',
  columnWidths?: number[],
  options?: { title?: string; companyName?: string; headerStyle?: 'simple' | 'dgii_606'; periodText?: string }
) => {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);

    const use606Header = options?.headerStyle === 'dgii_606';
    const totalColumns = headers.length || 1;

    let currentRow = 1;

    // Encabezado tipo 606 (empresa / título / período)
    if (use606Header) {
      // Fila 1: Nombre de empresa
      ws.mergeCells(currentRow, 1, currentRow, totalColumns);
      const companyCell = ws.getCell(currentRow, 1);
      companyCell.value = options?.companyName || '';
      companyCell.font = { bold: true };
      companyCell.alignment = { horizontal: 'left', vertical: 'middle' };
      currentRow++;

      // Fila 2: Título del reporte
      ws.mergeCells(currentRow, 1, currentRow, totalColumns);
      const titleCell = ws.getCell(currentRow, 1);
      titleCell.value = options?.title || '';
      titleCell.font = { bold: true };
      titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
      currentRow++;

      // Fila 3: Período
      ws.mergeCells(currentRow, 1, currentRow, totalColumns);
      const periodCell = ws.getCell(currentRow, 1);
      periodCell.value = options?.periodText || `Periodo: ${new Date().toISOString().slice(0, 7)}`;
      periodCell.alignment = { horizontal: 'left', vertical: 'middle' };
      currentRow++;

      // Fila 4: vacía
      currentRow++;
    } else if (options?.title || options?.companyName) {
      const titleParts: string[] = [];
      if (options?.companyName) titleParts.push(options.companyName);
      if (options?.title) titleParts.push(options.title);
      const titleText = titleParts.join(' - ');

      ws.mergeCells(currentRow, 1, currentRow, totalColumns);
      const titleCell = ws.getCell(currentRow, 1);
      titleCell.value = titleText;
      titleCell.font = { bold: true };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      currentRow++;
    }

    // Fila de encabezados de columnas (GREEN branded)
    const headerRow = ws.getRow(currentRow);
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h.title;
    });
    applyExcelHeaderStyle(headerRow);
    currentRow++;

    // Filas de datos
    for (const row of rows) {
      const dataRow = ws.getRow(currentRow);
      headers.forEach((h, idx) => {
        dataRow.getCell(idx + 1).value = row[h.key];
      });
      currentRow++;
    }

    // Anchos de columna
    if (columnWidths && columnWidths.length) {
      headers.forEach((_, idx) => {
        ws.getColumn(idx + 1).width = columnWidths[idx] || 14;
      });
    } else {
      headers.forEach((h, idx) => {
        ws.getColumn(idx + 1).width = Math.max(12, h.title.length + 2);
      });
    }

    // Generar y descargar
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `${fileName}.xlsx`);
  } catch (error) {
    console.error('Error al exportar a Excel con cabeceras:', error);
    throw error;
  }
};

// Función para cargar una imagen como base64
export const loadImageAsBase64 = (url: string): Promise<string> => {
  return new Promise((resolve, _reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.height = img.naturalHeight;
        canvas.width = img.naturalWidth;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('No se pudo obtener el contexto 2D del canvas');
        }
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } catch (error) {
        console.error('Error al procesar la imagen:', error);
        // Si hay un error, continuar sin el logo
        resolve('');
      }
    };
    
    img.onerror = () => {
      console.warn('No se pudo cargar el logo, se generará el PDF sin él');
      resolve('');
    };
    
    img.src = url;
  });
};

export const exportToPdf = async (
  data: any[],
  columns: any[],
  fileName: string,
  reportTitle: string = 'Report',
  orientation: 'p' | 'l' = 'p',
) => {
  try {
    // Verificar si hay datos
    if (!data || data.length === 0) {
      console.error('No hay datos para exportar');
      throw new Error('No hay datos para exportar');
    }

    // Verificar las columnas
    if (!columns || columns.length === 0) {
      console.error('No se definieron columnas para la exportación');
      throw new Error('No se definieron columnas para la exportación');
    }

    const doc = new jsPDF({ orientation });
    
    // Use branded header with logo (GREEN theme)
    const startY = await addPdfBrandedHeader(doc, reportTitle);

    // Preparar datos para la tabla
    const tableData = data.map(item => 
      columns.map(col => {
        const value = item[col.key];
        if (value === undefined || value === null) return '';
        if (typeof value === 'number') {
          return formatAmount(value);
        }
        return String(value);
      })
    );

    // Get branded table styles (GREEN theme)
    const tableStyles = getPdfTableStyles();

    // Agregar tabla with GREEN branded styles
    (doc as any).autoTable({
      head: [columns.map(col => col.label || col.key)],
      body: tableData,
      startY: startY,
      margin: { top: startY, right: 10, bottom: 20, left: 10 },
      ...tableStyles.styles,
      headStyles: tableStyles.headStyles,
      bodyStyles: tableStyles.bodyStyles,
      alternateRowStyles: tableStyles.alternateRowStyles,
      didDrawPage: function(data: any) {
        // Pie de página
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        
        // Solo mostrar número de página si hay más de una página
        if (data.pageCount > 1) {
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text(
            `Page ${data.pageNumber} of ${data.pageCount}`, 
            pageSize.width / 2, 
            pageHeight - 10,
            { align: 'center' }
          );
        }
        
        // Marca de agua sutil solo en la primera página y si hay espacio suficiente
        if (data.pageNumber === 1 && pageHeight > 400) {
          doc.setFontSize(60);
          doc.setTextColor(245, 245, 245);
          doc.text(
            reportTitle || 'Confidential', 
            pageSize.width / 2, 
            pageHeight / 2, 
            { 
              align: 'center', 
              angle: 45
            }
          );
        }
        
        // Restaurar color de texto
        doc.setTextColor(0, 0, 0);
      }
    });

    // Generar nombre de archivo con fecha
    const formattedDate = new Date().toISOString().split('T')[0];
    const pdfFileName = `${fileName}_${formattedDate}.pdf`;
    
    console.log('Guardando PDF como:', pdfFileName);
    
    // Guardar el PDF
    doc.save(pdfFileName);
    
    console.log('PDF generado exitosamente');
    return true;
  } catch (error) {
    console.error('Error al exportar a PDF:', error);
    // Crear un PDF de error como respaldo
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Error generating report', 20, 20);
      doc.setFontSize(12);
      doc.text('An error occurred while generating the PDF. Please try again.', 20, 40);
      doc.text(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 20, 50);
      doc.save(`error_${new Date().getTime()}.pdf`);
    } catch (e) {
      console.error('Error al generar PDF de error:', e);
    }
    
    throw error;
  }
};

export const importFromExcel = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = utils.sheet_to_json(worksheet);
          resolve(jsonData);
        } catch (error) {
          reject(new Error('Error al procesar el archivo Excel'));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Error al leer el archivo'));
      };
      
      reader.readAsBinaryString(file);
    } catch (error) {
      reject(error);
    }
  });
};
