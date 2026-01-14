import { useState } from 'react';

export type InvoiceTemplateType = 'simple' | 'detailed' | 'quotation';

interface InvoiceTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: InvoiceTemplateType) => void;
  documentType?: 'invoice' | 'supplier_invoice' | 'quote';
  title?: string;
}

const BRAND_GREEN = '#008000';

export default function InvoiceTypeModal({
  isOpen,
  onClose,
  onSelect,
  documentType = 'invoice',
  title = 'Select Document Format',
}: InvoiceTypeModalProps) {
  const [selectedType, setSelectedType] = useState<InvoiceTemplateType>('simple');

  if (!isOpen) return null;

  const templates = [
    {
      id: 'simple' as InvoiceTemplateType,
      name: 'Simple Invoice',
      description: 'Clean and minimal format with essential information',
      icon: 'ri-file-text-line',
      preview: (
        <div className="bg-white border border-gray-200 rounded p-2 text-[6px] leading-tight">
          <div className="flex justify-between mb-1">
            <div className="font-bold text-[7px]">LOGO</div>
            <div className="text-right font-bold" style={{ color: BRAND_GREEN }}>INVOICE</div>
          </div>
          <div className="border-t border-gray-200 my-1"></div>
          <div className="mb-1">Customer: ___</div>
          <div className="border border-gray-200 rounded p-1 mb-1">
            <div className="grid grid-cols-4 gap-1 text-[5px] font-semibold border-b border-gray-100 pb-0.5">
              <span>Description</span>
              <span>Qty</span>
              <span>Price</span>
              <span>Amount</span>
            </div>
            <div className="h-3"></div>
          </div>
          <div className="text-right">
            <div>Subtotal: ___</div>
            <div>Tax: ___</div>
            <div className="font-bold">Total: ___</div>
          </div>
        </div>
      ),
    },
    {
      id: 'detailed' as InvoiceTemplateType,
      name: 'Detailed Invoice',
      description: 'Complete format with terms, signature and additional notes',
      icon: 'ri-file-list-3-line',
      preview: (
        <div className="bg-white border border-gray-200 rounded p-2 text-[6px] leading-tight">
          <div className="flex justify-between mb-1">
            <div className="font-bold text-[7px]">LOGO</div>
            <div className="text-right font-bold" style={{ color: BRAND_GREEN }}>INVOICE</div>
          </div>
          <div className="border-t border-gray-200 my-1"></div>
          <div className="grid grid-cols-2 gap-1 mb-1">
            <div>Customer: ___</div>
            <div>Address: ___</div>
          </div>
          <div className="border border-gray-200 rounded p-1 mb-1">
            <div className="grid grid-cols-4 gap-1 text-[5px] font-semibold border-b border-gray-100 pb-0.5">
              <span>Description</span>
              <span>Qty</span>
              <span>Price</span>
              <span>Amount</span>
            </div>
            <div className="h-2"></div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div className="border border-gray-200 rounded p-1 text-[5px]">
              <div className="font-semibold">Terms & Conditions</div>
              <div className="h-2"></div>
            </div>
            <div className="text-right text-[5px]">
              <div>Subtotal: ___</div>
              <div>Tax: ___</div>
              <div className="font-bold">Total: ___</div>
            </div>
          </div>
          <div className="mt-1 text-[5px]">Signature: X___</div>
        </div>
      ),
    },
    {
      id: 'quotation' as InvoiceTemplateType,
      name: documentType === 'supplier_invoice' ? 'Purchase Order' : 'Quotation',
      description: documentType === 'supplier_invoice' 
        ? 'Purchase order format for suppliers' 
        : 'Quote format with terms and validity',
      icon: 'ri-draft-line',
      preview: (
        <div className="bg-white border border-gray-200 rounded p-2 text-[6px] leading-tight">
          <div className="flex justify-between mb-1">
            <div className="font-bold text-[7px]">LOGO</div>
            <div className="text-right font-bold" style={{ color: BRAND_GREEN }}>
              {documentType === 'supplier_invoice' ? 'PURCHASE ORDER' : 'QUOTATION'}
            </div>
          </div>
          <div className="border-t border-gray-200 my-1"></div>
          <div className="grid grid-cols-3 gap-1 mb-1 text-[5px]">
            <div>Customer Info</div>
            <div>Created By</div>
            <div>Status</div>
          </div>
          <div className="border border-gray-200 rounded p-1 mb-1">
            <div className="grid grid-cols-4 gap-1 text-[5px] font-semibold border-b border-gray-100 pb-0.5">
              <span>Qty</span>
              <span>Description</span>
              <span>Price</span>
              <span>Amount</span>
            </div>
            <div className="h-2"></div>
          </div>
          <div className="grid grid-cols-4 gap-1 text-[5px] border-t border-gray-200 pt-1">
            <div>Subtotal</div>
            <div>Tax</div>
            <div>Terms</div>
            <div className="font-bold">Total</div>
          </div>
          <div className="mt-1 border border-gray-200 rounded p-1 text-[5px]">
            <div className="font-semibold">General Terms</div>
          </div>
        </div>
      ),
    },
  ];

  const handleConfirm = () => {
    onSelect(selectedType);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
        
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div 
            className="p-6 text-center text-white"
            style={{ background: `linear-gradient(135deg, ${BRAND_GREEN} 0%, #006600 100%)` }}
          >
            <div className="w-16 h-16 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
              <i className="ri-printer-line text-3xl text-white"></i>
            </div>
            <h2 className="text-2xl font-bold">{title}</h2>
            <p className="text-white/80 mt-1">
              Choose the format that best suits your needs
            </p>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedType(template.id)}
                  className={`relative p-4 rounded-xl border-2 transition-all duration-200 text-left hover:shadow-lg ${
                    selectedType === template.id
                      ? 'border-[#008000] bg-green-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  {selectedType === template.id && (
                    <div 
                      className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: BRAND_GREEN }}
                    >
                      <i className="ri-check-line text-white text-sm"></i>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-3 mb-3">
                    <div 
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        selectedType === template.id 
                          ? 'bg-[#008000] text-white' 
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      <i className={`${template.icon} text-xl`}></i>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{template.name}</h3>
                    </div>
                  </div>
                  
                  <p className="text-xs text-gray-500 mb-3">{template.description}</p>
                  
                  {/* Preview */}
                  <div className="transform scale-100 origin-top-left">
                    {template.preview}
                  </div>
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={onClose}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-5 py-2.5 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
                style={{ backgroundColor: BRAND_GREEN }}
              >
                <i className="ri-printer-line"></i>
                Print {templates.find(t => t.id === selectedType)?.name}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
