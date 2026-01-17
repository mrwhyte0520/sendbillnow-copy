import React, { useRef } from 'react';
import { Button } from '../ui/button';
import { Download, Upload } from 'lucide-react';
import { exportToExcel, exportToPdf, importFromExcel } from '../../utils/exportImportUtils';
import { toast } from 'sonner';

interface ImportExportButtonsProps<T> {
  data: T[];
  columns: { key: string; label: string }[];
  fileName: string;
  companyName?: string;
  onImport?: (data: T[]) => void;
  disabled?: boolean;
}

export function ImportExportButtons<T>({ 
  data, 
  columns, 
  fileName, 
  companyName = '',
  onImport,
  disabled = false
}: ImportExportButtonsProps<T>) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportExcel = () => {
    try {
      exportToExcel(data, fileName);
      toast.success('Excel export completed');
    } catch (error) {
      toast.error('Error exporting to Excel');
      console.error(error);
    }
  };

  const handleExportPdf = async () => {
    try {
      await exportToPdf(data, columns, fileName, companyName);
      toast.success('PDF export completed');
    } catch (error) {
      toast.error('Error exporting to PDF');
      console.error(error);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const importedData = await importFromExcel(file);
      if (onImport) {
        onImport(importedData as T[]);
      }
      toast.success('Import completed successfully');
    } catch (error) {
      toast.error('Error importing file');
      console.error(error);
    } finally {
      // Reset the input value to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex gap-2">
      <Button 
        variant="outline" 
        size="sm" 
        onClick={handleExportExcel}
        disabled={disabled || data.length === 0}
        className="gap-2"
      >
        <Download className="h-4 w-4" />
        Excel
      </Button>
      
      <Button 
        variant="outline" 
        size="sm" 
        onClick={handleExportPdf}
        disabled={disabled || data.length === 0}
        className="gap-2"
      >
        <Download className="h-4 w-4" />
        PDF
      </Button>
      
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx, .xls"
        className="hidden"
      />
      
      <Button 
        variant="outline" 
        size="sm" 
        onClick={handleImportClick}
        disabled={disabled}
        className="gap-2"
      >
        <Upload className="h-4 w-4" />
        Import
      </Button>
    </div>
  );
}
