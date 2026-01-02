import { useState } from 'react';
import { importFromExcel } from '../utils/exportImportUtils';
import { toast } from 'sonner';

interface ImportExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: any[]) => Promise<void>;
  templateHeaders: { key: string; title: string }[];
  moduleName: string;
  onDownloadTemplate?: () => void;
}

export default function ImportExcelModal({
  isOpen,
  onClose,
  onImport,
  templateHeaders,
  moduleName,
  onDownloadTemplate
}: ImportExcelModalProps) {
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      toast.error('Please select an Excel file (.xlsx or .xls)');
      return;
    }

    
    try {
      toast.loading('Processing file...');
      const data = await importFromExcel(selectedFile);
      
      if (!data || data.length === 0) {
        toast.dismiss();
        toast.error('The file is empty or does not contain valid data');
        return;
      }

      setPreviewData(data);
      setStep('preview');
      toast.dismiss();
      toast.success(`${data.length} records loaded for review`);
    } catch (error) {
      toast.dismiss();
      toast.error('Error reading Excel file');
      console.error(error);
    }
  };

  const handleImport = async () => {
    if (previewData.length === 0) return;

    setIsProcessing(true);
    try {
      await onImport(previewData);
      toast.success(`${previewData.length} records imported successfully`);
      handleClose();
    } catch (error: any) {
      toast.error(error.message || 'Error importing data');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setPreviewData([]);
    setStep('upload');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-gray-900">
            Import {moduleName} from Excel
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        {step === 'upload' ? (
          <div className="space-y-6">
            {/* Instrucciones */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2 flex items-center">
                <i className="ri-information-line mr-2"></i>
                Instructions
              </h4>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Download the Excel template by clicking the button below</li>
                <li>Fill in the data in the template without modifying the headers</li>
                <li>Save the file and upload it using the "Select Excel File" button</li>
                <li>Review the data in the preview before importing</li>
              </ul>
            </div>

            {/* Botón descargar plantilla */}
            {onDownloadTemplate && (
              <button
                onClick={onDownloadTemplate}
                className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
              >
                <i className="ri-file-excel-line text-xl"></i>
                <span>Download Excel Template</span>
              </button>
            )}

            {/* Selector de archivo */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <i className="ri-upload-cloud-2-line text-6xl text-gray-400 mb-4"></i>
              <p className="text-gray-600 mb-4">
                Drag an Excel file here or click to select
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                id="excel-upload"
              />
              <label
                htmlFor="excel-upload"
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer inline-block"
              >
                Select Excel File
              </label>
            </div>

            {/* Columnas esperadas */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-3">
                Expected columns in the template:
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {templateHeaders.map((header, idx) => (
                  <div
                    key={idx}
                    className="bg-white px-3 py-2 rounded border border-gray-200 text-sm text-gray-700"
                  >
                    <i className="ri-checkbox-circle-line text-green-500 mr-1"></i>
                    {header.title}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Vista previa */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-semibold text-yellow-900 mb-2 flex items-center">
                <i className="ri-eye-line mr-2"></i>
                Data Preview ({previewData.length} records)
              </h4>
              <p className="text-sm text-yellow-800">
                Review the data before importing. Empty or invalid fields may cause errors.
              </p>
            </div>

            {/* Tabla de vista previa */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-96">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                      {Object.keys(previewData[0] || {}).map((key, idx) => (
                        <th
                          key={idx}
                          className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap"
                        >
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {previewData.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-500">{idx + 1}</td>
                        {Object.values(row).map((value: any, valIdx) => (
                          <td
                            key={valIdx}
                            className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap"
                          >
                            {value !== null && value !== undefined ? String(value) : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewData.length > 10 && (
                <div className="bg-gray-50 px-4 py-2 text-sm text-gray-500 text-center border-t">
                  Showing 10 of {previewData.length} records
                </div>
              )}
            </div>

            {/* Botones de acción */}
            <div className="flex space-x-3">
              <button
                onClick={() => setStep('upload')}
                className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 transition-colors"
                disabled={isProcessing}
              >
                <i className="ri-arrow-left-line mr-2"></i>
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={isProcessing}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-2"></i>
                    Importing...
                  </>
                ) : (
                  <>
                    <i className="ri-check-line mr-2"></i>
                    Import {previewData.length} Records
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
