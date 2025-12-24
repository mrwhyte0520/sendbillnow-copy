import { read, utils, writeFile } from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { settingsService } from '../services/database';
import { formatAmount } from './numberFormat';

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

  let companyName = 'ContaBi';
  try {
    const info = await settingsService.getCompanyInfo();
    if (info) {
      companyName = (info as any).name || (info as any).company_name || 'ContaBi';
    }
  } catch {
    // usar default
  }

  const totalColumns = Math.max(1, columns.length);
  let currentRow = 1;

  // Encabezado superior (empresa / título / fecha)
  ws.mergeCells(currentRow, 1, currentRow, totalColumns);
  ws.getCell(currentRow, 1).value = companyName;
  ws.getCell(currentRow, 1).font = { bold: true, size: 14 };
  ws.getCell(currentRow, 1).alignment = { horizontal: 'left', vertical: 'middle' };
  currentRow++;

  ws.mergeCells(currentRow, 1, currentRow, totalColumns);
  ws.getCell(currentRow, 1).value = sheetName;
  ws.getCell(currentRow, 1).font = { bold: true, size: 12 };
  ws.getCell(currentRow, 1).alignment = { horizontal: 'left', vertical: 'middle' };
  currentRow++;

  ws.mergeCells(currentRow, 1, currentRow, totalColumns);
  ws.getCell(currentRow, 1).value = `Generado: ${new Date().toLocaleDateString('es-DO')}`;
  ws.getCell(currentRow, 1).alignment = { horizontal: 'left', vertical: 'middle' };
  currentRow++;

  // línea en blanco
  currentRow++;

  // Columnas (sin header automático; el header lo pintamos manual)
  ws.columns = columns.map(col => ({ key: col.key, width: col.width || 14 }));

  // Header row (cabecera de columnas)
  const headerRowIndex = currentRow;
  const header = ws.getRow(headerRowIndex);
  columns.forEach((col, idx) => {
    const cell = header.getCell(idx + 1);
    cell.value = col.title;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
    cell.alignment = { vertical: 'middle' };
  });
  currentRow++;

  // Freeze panes at header row
  ws.views = [{ state: 'frozen', ySplit: headerRowIndex }];

  // Data rows
  rows.forEach(row => {
    const values: Record<string, any> = {};
    columns.forEach(col => {
      values[col.key] = row[col.key];
    });
    ws.addRow(values);
  });

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
  companyName: string = 'ContaBi', // aquí suele llegar el título del reporte
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
    let startY = 20; // Posición Y inicial para el contenido
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Omitir el logo por ahora para simplificar
    console.log('Iniciando generación de PDF...');
    
    // Resolver nombre de la empresa desde configuración
    let resolvedCompanyName: string | undefined = undefined;
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info.name || (info as any).company_name)) {
        resolvedCompanyName = info.name || (info as any).company_name;
      }
    } catch (error) {
      // Si falla, usamos el valor recibido o el default
      // eslint-disable-next-line no-console
      console.error('Error obteniendo información de la empresa para PDF:', error);
    }

    const mainTitle = resolvedCompanyName || 'ContaBi';
    const reportTitle = companyName && companyName !== mainTitle ? companyName : '';

    // Configurar estilos para títulos
    doc.setFontSize(18);
    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'bold');

    // Título principal: nombre de la empresa (centrado)
    doc.text(mainTitle, pageWidth / 2, 18, { align: 'center' } as any);

    // Subtítulo: nombre del reporte si se envió
    if (reportTitle) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(reportTitle, pageWidth / 2, 26, { align: 'center' } as any);
      startY = 38;
    } else {
      startY = 30;
    }
    
    // Línea divisoria debajo del encabezado
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(14, startY - 5, pageWidth - 14, startY - 5);

    // Fecha de generación (colocada debajo del título del reporte, sin taparlo)
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    const date = new Date().toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const dateY = reportTitle ? 32 : startY - 6;
    doc.text(`Generado el: ${date}`, 14, dateY);

    // Preparar datos para la tabla
    const tableData = data.map(item => 
      columns.map(col => {
        const value = item[col.key];
        // Manejar valores undefined o null
        if (value === undefined || value === null) return '';
        // Formatear números con separadores de miles
        if (typeof value === 'number') {
          return formatAmount(value);
        }
        return String(value);
      })
    );

    console.log('Datos de la tabla preparados:', tableData.slice(0, 2));

    // Agregar tabla
    console.log('Agregando tabla al PDF...');
    (doc as any).autoTable({
      head: [columns.map(col => col.label || col.key)],
      body: tableData,
      startY: startY,
      margin: { top: startY, right: 10, bottom: 20, left: 10 },
      styles: { 
        fontSize: 8,
        cellPadding: 3,
        lineColor: [220, 220, 220],
        textColor: [40, 40, 40],
        overflow: 'linebreak',
        lineWidth: 0.1
      },
      headStyles: { 
        fillColor: [41, 128, 185],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        textPadding: { top: 2, right: 2, bottom: 2, left: 2 }
      },
      bodyStyles: {
        textPadding: { top: 2, right: 2, bottom: 2, left: 2 }
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      didDrawPage: function(data: any) {
        // Pie de página
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        
        // Solo mostrar número de página si hay más de una página
        if (data.pageCount > 1) {
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text(
            `Página ${data.pageNumber} de ${data.pageCount}`, 
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
            companyName || 'Confidencial', 
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
      doc.text('Error al generar el informe', 20, 20);
      doc.setFontSize(12);
      doc.text('Ocurrió un error al generar el PDF. Por favor, intente nuevamente.', 20, 40);
      doc.text(`Error: ${error instanceof Error ? error.message : 'Error desconocido'}`, 20, 50);
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
