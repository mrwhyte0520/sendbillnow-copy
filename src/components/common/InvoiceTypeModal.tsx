import { useEffect, useState } from 'react';

export type InvoiceTemplateType = 'simple' | 'detailed' | 'quotation' | 'corporate';

interface InvoiceTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: InvoiceTemplateType) => void;
  documentType?: 'invoice' | 'supplier_invoice' | 'quote';
  title?: string;
  customerEmail?: string;
  onSendEmail?: (type: InvoiceTemplateType) => void;
}

const BRAND_BLUE = '#0d3b66';

export default function InvoiceTypeModal({
  isOpen,
  onClose,
  onSelect,
  documentType = 'invoice',
  title = 'Select Document Format',
  customerEmail,
  onSendEmail,
}: InvoiceTypeModalProps) {
  const [selectedType, setSelectedType] = useState<InvoiceTemplateType>('simple');

  useEffect(() => {
    if (!isOpen) return;
    if (documentType === 'quote' || documentType === 'supplier_invoice') {
      setSelectedType('quotation');
      return;
    }
    setSelectedType('simple');
  }, [documentType, isOpen]);

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
            <div className="text-right font-bold" style={{ color: BRAND_BLUE }}>INVOICE</div>
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
            <div className="text-right font-bold" style={{ color: BRAND_BLUE }}>INVOICE</div>
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
      name: documentType === 'supplier_invoice' ? 'Purchase Order' : 'Estimate',
      description: documentType === 'supplier_invoice' 
        ? 'Purchase order format for suppliers' 
        : 'Quote format with terms and validity',
      icon: 'ri-draft-line',
      preview: (
        <div className="bg-white border border-gray-200 rounded p-2 text-[6px] leading-tight">
          <div className="flex justify-between mb-1">
            <div className="font-bold text-[7px]">LOGO</div>
            <div className="text-right font-bold" style={{ color: BRAND_BLUE }}>
              {documentType === 'supplier_invoice' ? 'PURCHASE ORDER' : 'ESTIMATE'}
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
    {
      id: 'corporate' as InvoiceTemplateType,
      name: 'Corporate Invoice',
      description: 'Professional format with header banner, Bill To/Ship To and Balance Due',
      icon: 'ri-building-2-line',
      preview: (
        <div className="bg-white border border-gray-200 rounded overflow-hidden text-[6px] leading-tight">
          <div className="bg-[#001B9E] text-white p-1.5 text-center">
            <div className="font-bold text-[7px]">COMPANY NAME</div>
            <div className="text-[5px] opacity-80">Address • Phone</div>
          </div>
          <div className="p-2">
            <div className="text-right font-bold text-[8px] mb-1">INVOICE</div>
            <div className="grid grid-cols-2 gap-2 mb-1 text-[5px]">
              <div><span className="font-semibold">Bill To:</span><br/>Customer</div>
              <div><span className="font-semibold">Ship To:</span><br/>Address</div>
            </div>
            <div className="border border-gray-200 rounded p-1 mb-1">
              <div className="grid grid-cols-4 gap-1 text-[5px] font-semibold bg-[#001B9E] text-white -m-1 mb-1 p-1">
                <span>Desc</span>
                <span>Qty</span>
                <span>Price</span>
                <span>Total</span>
              </div>
              <div className="h-2"></div>
            </div>
            <div className="flex justify-between">
              <div className="text-[5px] border border-gray-200 rounded p-1 flex-1 mr-1">Notes</div>
              <div className="text-[5px] w-20">
                <div className="flex justify-between"><span>Subtotal:</span><span>___</span></div>
                <div className="flex justify-between"><span>Tax:</span><span>___</span></div>
                <div className="bg-[#001B9E] text-white p-1 rounded mt-1 flex justify-between font-bold">
                  <span>Balance:</span><span>$___</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const handleConfirm = () => {
    onSelect(selectedType);
    onClose();
  };

  const handleSendEmail = () => {
    if (onSendEmail) {
      onSendEmail(selectedType);
    }
    onClose();
  };

  const canSendEmail = Boolean(customerEmail && customerEmail.includes('@'));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
        
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div 
            className="p-6 text-center text-white"
            style={{ background: `linear-gradient(135deg, #008000 0%, #006600 100%)` }}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                      style={{ backgroundColor: '#008000' }}
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
              {onSendEmail && (
                <button
                  onClick={handleSendEmail}
                  disabled={!canSendEmail}
                  className={`px-5 py-2.5 rounded-lg font-semibold transition-all flex items-center gap-2 ${
                    canSendEmail
                      ? 'bg-blue-600 text-white shadow-lg hover:shadow-xl hover:bg-blue-700'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                  title={canSendEmail ? `Send to ${customerEmail}` : 'Customer email required'}
                >
                  <i className="ri-mail-send-line"></i>
                  Send via Email
                </button>
              )}
              <button
                onClick={handleConfirm}
                className="px-5 py-2.5 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
                style={{ backgroundColor: '#008000' }}
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
