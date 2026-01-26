
import { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { settingsService } from '../../../services/database';
import { useAuth } from '../../../hooks/useAuth';

interface CompanyInfo {
  id?: string;
  name: string;
  ruc: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logo?: string;
  fiscal_year_start: string;
  currency: string;
  timezone: string;
  // Social links
  facebook?: string;
  instagram?: string;
  twitter?: string;
  linkedin?: string;
  youtube?: string;
  tiktok?: string;
  whatsapp?: string;
}

interface CashRegister {
  id: string;
  name: string;
  location?: string;
  is_active: boolean;
  created_at?: string;
}

interface UserRow {
  id: string;
  email?: string;
  status?: string;
}

interface PrinterConfig {
  id: string;
  name: string;
  area: 'front' | 'kitchen' | 'bar' | 'other';
  type: 'network_raw' | 'usb' | 'windows';
  host?: string;
  port?: number;
  paper_width_mm?: number;
  auto_print: boolean;
  is_default: boolean;
  is_active: boolean;
}

interface PrinterAgent {
  id: string;
  name: string;
  is_active: boolean;
  last_seen?: string;
}

type SettingsTab = 'company' | 'social' | 'printers' | 'register';

export default function CompanySettingsPage() {
  useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('company');
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    name: '',
    ruc: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    fiscal_year_start: '01-01',
    currency: 'DOP',
    timezone: 'America/Santo_Domingo'
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Registers state
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [registerAssignments, setRegisterAssignments] = useState<Record<string, string>>({});
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [editingRegister, setEditingRegister] = useState<CashRegister | null>(null);
  const [newRegisterName, setNewRegisterName] = useState('');

  // Printers state
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [printerAgents] = useState<PrinterAgent[]>([]);
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<PrinterConfig | null>(null);
  const [newPrinterName, setNewPrinterName] = useState('');
  const [newPrinterType, setNewPrinterType] = useState<PrinterConfig['type']>('network_raw');
  const [newPrinterHost, setNewPrinterHost] = useState('');
  const [newPrinterPort, setNewPrinterPort] = useState(9100);
  const [newPrinterPaperWidth, setNewPrinterPaperWidth] = useState(80);
  const [newPrinterAutoPrint, setNewPrinterAutoPrint] = useState(true);
  const [newPrinterActive, setNewPrinterActive] = useState(true);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setMessage({ type: 'error', text: 'Image must be less than 2MB' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setLogoPreview(base64);
        setCompanyInfo(prev => ({ ...prev, logo: base64 }));
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    setLogoPreview(null);
    setCompanyInfo(prev => ({ ...prev, logo: '' }));
  };

  useEffect(() => {
    loadCompanyInfo();
  }, []);

  const loadCompanyInfo = async () => {
    try {
      const data = await settingsService.getCompanyInfo();
      if (data) {
        setCompanyInfo(data);
        if (data.logo) {
          setLogoPreview(data.logo);
        }
      }
    } catch (error) {
      console.error('Error loading company info:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const saved = await settingsService.saveCompanyInfo(companyInfo);
      if (saved) {
        setCompanyInfo(saved);
        setLogoPreview(saved.logo || null);
      }
      setMessage({ type: 'success', text: 'Company information saved successfully' });
    } catch (error) {
      const errorText =
        typeof (error as any)?.message === 'string' && (error as any).message
          ? (error as any).message
          : 'Error saving company information';
      setMessage({ type: 'error', text: errorText });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof CompanyInfo, value: string) => {
    setCompanyInfo(prev => ({ ...prev, [field]: value }));
  };

  const loadPrinters = async () => {
    try {
      const data = await settingsService.getPrinters();
      setPrinters((data as any) ?? []);
    } catch (error) {
      console.error('Error loading printers:', error);
    }
  };

  const loadRegistersAndAssignments = async () => {
    try {
      const [regs, u, assigns] = await Promise.all([
        settingsService.getCashRegisters(),
        settingsService.getUsers(),
        settingsService.getUserCashRegisterAssignments(),
      ]);
      setRegisters(regs as any);
      setUsers(u as any);

      const map: Record<string, string> = {};
      (assigns as any[]).forEach((a) => {
        if (a?.user_id && a?.cash_register_id) {
          map[String(a.user_id)] = String(a.cash_register_id);
        }
      });
      setRegisterAssignments(map);
    } catch (error) {
      console.error('Error loading registers/assignments:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'register') {
      loadRegistersAndAssignments();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'printers') {
      loadPrinters();
    }
  }, [activeTab]);

  // Register handlers
  const handleSaveRegister = async () => {
    if (!newRegisterName.trim()) {
      setMessage({ type: 'error', text: 'Register name is required' });
      return;
    }

    const registerNumber = newRegisterName.trim();
    const registerDisplayName = registerNumber ? `Caja #${registerNumber}` : '';

    setLoading(true);
    try {
      await settingsService.saveCashRegister({
        id: editingRegister?.id,
        name: registerDisplayName,
        is_active: true,
      });
      await loadRegistersAndAssignments();
      setShowRegisterModal(false);
      setEditingRegister(null);
      setNewRegisterName('');
      setMessage({ type: 'success', text: editingRegister ? 'Register updated' : 'Register created' });
    } catch (error) {
      const errorText =
        typeof (error as any)?.message === 'string' && (error as any).message
          ? (error as any).message
          : 'Error saving register';
      setMessage({ type: 'error', text: errorText });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRegister = async (id: string) => {
    if (!confirm('Are you sure you want to delete this register?')) return;
    setLoading(true);
    try {
      await settingsService.deleteCashRegister(id);
      await loadRegistersAndAssignments();
      setMessage({ type: 'success', text: 'Register deleted' });
    } catch (error) {
      const errorText =
        typeof (error as any)?.message === 'string' && (error as any).message
          ? (error as any).message
          : 'Error deleting register';
      setMessage({ type: 'error', text: errorText });
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRegister = async (targetUserId: string, registerId: string) => {
    setLoading(true);
    try {
      if (!registerId) {
        await settingsService.unassignCashRegisterFromUser(targetUserId);
      } else {
        await settingsService.assignCashRegisterToUser(targetUserId, registerId);
      }
      await loadRegistersAndAssignments();
      setMessage({ type: 'success', text: 'Register assignment saved' });
    } catch (error) {
      const errorText =
        typeof (error as any)?.message === 'string' && (error as any).message
          ? (error as any).message
          : 'Error saving register assignment';
      setMessage({ type: 'error', text: errorText });
    } finally {
      setLoading(false);
    }
  };

  // Printer handlers
  const handleSavePrinter = async () => {
    if (!newPrinterName.trim()) {
      setMessage({ type: 'error', text: 'Printer name is required' });
      return;
    }

    if (newPrinterType === 'network_raw' && !newPrinterHost.trim()) {
      setMessage({ type: 'error', text: 'Host is required for network printers' });
      return;
    }

    setLoading(true);
    try {
      await settingsService.savePrinter({
        id: editingPrinter?.id,
        name: newPrinterName,
        area: editingPrinter?.area ?? 'front',
        type: newPrinterType,
        host: newPrinterHost || null,
        port: newPrinterPort,
        paper_width_mm: newPrinterPaperWidth,
        auto_print: newPrinterAutoPrint,
        is_default: editingPrinter?.is_default ?? printers.length === 0,
        is_active: newPrinterActive,
      });

      await loadPrinters();
      setShowPrinterModal(false);
      setEditingPrinter(null);
      setNewPrinterName('');
      setNewPrinterType('network_raw');
      setNewPrinterHost('');
      setNewPrinterPort(9100);
      setNewPrinterPaperWidth(80);
      setNewPrinterAutoPrint(true);
      setNewPrinterActive(true);
      setMessage({ type: 'success', text: editingPrinter ? 'Printer updated' : 'Printer added' });
    } catch (error) {
      const errorText =
        typeof (error as any)?.message === 'string' && (error as any).message
          ? (error as any).message
          : 'Error saving printer';
      setMessage({ type: 'error', text: errorText });
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePrinter = async (id: string) => {
    if (!confirm('Are you sure you want to delete this printer?')) return;
    setLoading(true);
    try {
      await settingsService.deletePrinter(id);
      await loadPrinters();
      setMessage({ type: 'success', text: 'Printer deleted' });
    } catch (error) {
      const errorText =
        typeof (error as any)?.message === 'string' && (error as any).message
          ? (error as any).message
          : 'Error deleting printer';
      setMessage({ type: 'error', text: errorText });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPrinterInstructions = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const marginX = 48;
    const marginY = 56;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - marginX * 2;

    const addWrappedLines = (text: string, y: number, fontSize: number, isBold = false) => {
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(text, contentWidth);
      const lineHeight = Math.max(fontSize + 4, 14);
      for (const line of lines) {
        if (y > pageHeight - marginY) {
          doc.addPage();
          y = marginY;
        }
        doc.text(String(line), marginX, y);
        y += lineHeight;
      }
      return y;
    };

    let y = marginY;
    y = addWrappedLines('Instructions: Printing with Printers', y, 16, true);
    y += 6;
    y = addWrappedLines('Objective: Automatically print kitchen/bar tickets when an order is created.', y, 11);
    y += 10;

    y = addWrappedLines('1) Requirements', y, 12, true);
    y += 4;
    y = addWrappedLines('- Have a PC/mini-PC at the business (Windows recommended) that stays ON.', y, 11);
    y = addWrappedLines('- Have the printer installed (USB/Windows) or connected to the local network (LAN).', y, 11);
    y = addWrappedLines('- The printer agent connects to the cloud via internet (no need to open router ports).', y, 11);
    y += 10;

    y = addWrappedLines('2) Configure the printer in the system', y, 12, true);
    y += 4;
    y = addWrappedLines('- Go to Settings > Printers.', y, 11);
    y = addWrappedLines('- Click Add printer.', y, 11);
    y = addWrappedLines('- Choose Area: kitchen / bar / other.', y, 11);
    y = addWrappedLines('- Choose Type:', y, 11);
    y = addWrappedLines('  - network_raw: put Host (IP) and Port (usually 9100).', y, 11);
    y = addWrappedLines('  - windows: enter the Windows printer name (exactly as it appears in Windows / spooler).', y, 11);
    y = addWrappedLines('- Enable Auto print and Active.', y, 11);
    y += 10;

    y = addWrappedLines('3) Connect the agent (no .env changes)', y, 12, true);
    y += 4;
    y = addWrappedLines('- In Settings > Printers > Printer agents, click Connect agent.', y, 11);
    y = addWrappedLines('- The system generates a connection code (expires in ~10 minutes).', y, 11);
    y = addWrappedLines('- On the business PC, open the Printer Agent and enter the code.', y, 11);
    y = addWrappedLines('- The agent will register and remain saved on that PC.', y, 11);
    y += 10;

    y = addWrappedLines('4) Verification', y, 12, true);
    y += 4;
    y = addWrappedLines('- Create an order and send it to kitchen/bar.', y, 11);
    y = addWrappedLines('- The system creates a print job.', y, 11);
    y = addWrappedLines('- The agent claims the job, prints it and marks it as printed (or failed).', y, 11);
    y += 10;

    y = addWrappedLines('5) Common problems', y, 12, true);
    y += 4;
    y = addWrappedLines('- Nothing prints (network_raw): confirm IP, port 9100, and that the printer supports RAW/9100.', y, 11);
    y = addWrappedLines('- Nothing prints (windows): confirm the printer name matches exactly (Windows Printers panel).', y, 11);
    y = addWrappedLines('- Jobs never arrive: confirm the printer is Active and Auto print is enabled.', y, 11);
    y = addWrappedLines('- Agent cannot connect: check the business PC internet and that the system domain is reachable.', y, 11);

    doc.save('printer-instructions.pdf');
  };

  const handleReloadPrinters = () => {
    loadPrinters();
  };

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'company', label: 'Company', icon: 'ri-building-line' },
    { id: 'social', label: 'Social Links', icon: 'ri-links-line' },
    { id: 'printers', label: 'Printers', icon: 'ri-printer-line' },
    { id: 'register', label: 'Register', icon: 'ri-funds-box-line' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 bg-[#F8F3E7] min-h-full p-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#3B4A2A] to-[#1F2616] rounded-2xl shadow-lg shadow-[#1F2616]/30 border border-[#2A351E] p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Company Settings</h1>
              <p className="text-[#CFE6AB] mt-1">
                Configure your company details, social links, printers, and registers
              </p>
            </div>
            <button
              onClick={() => window.REACT_APP_NAVIGATE('/settings')}
              className="flex items-center space-x-2 text-white hover:text-[#D7E5C1]"
            >
              <i className="ri-arrow-left-line"></i>
              <span>Back to Settings</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-2">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#3B4A2A] text-white shadow-md'
                    : 'text-[#5F6652] hover:bg-[#F0E8D7]'
                }`}
              >
                <i className={tab.icon}></i>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'company' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Company Logo */}
            <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
              <h2 className="text-lg font-semibold text-[#1F2618] mb-4">Company Logo</h2>
              <div className="flex items-start gap-6">
                <div className="w-32 h-32 border-2 border-dashed border-[#E2D6BD] rounded-xl flex items-center justify-center bg-[#FDFBF7] overflow-hidden">
                  {logoPreview || companyInfo.logo ? (
                    <img
                      src={logoPreview || companyInfo.logo}
                      alt="Company Logo"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center text-gray-400">
                      <i className="ri-image-line text-3xl"></i>
                      <p className="text-xs mt-1">No logo</p>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-600 mb-3">
                    Upload your company logo. This will appear on invoices, quotes, and other documents.
                  </p>
                  <div className="flex items-center gap-3">
                    <label className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg hover:bg-[#2D3B1E] cursor-pointer transition-colors text-sm font-medium">
                      <i className="ri-upload-2-line mr-2"></i>
                      Upload Logo
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                        onChange={handleLogoChange}
                        className="hidden"
                      />
                    </label>
                    {(logoPreview || companyInfo.logo) && (
                      <button
                        type="button"
                        onClick={removeLogo}
                        className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium"
                      >
                        <i className="ri-delete-bin-line mr-2"></i>
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Recommended: PNG or JPG, max 2MB, square format
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
              <h2 className="text-lg font-semibold text-[#1F2618] mb-4">Basic Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={companyInfo.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address *
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={companyInfo.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={companyInfo.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={companyInfo.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Website
                  </label>
                  <input
                    type="text"
                    value={companyInfo.website}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => window.REACT_APP_NAVIGATE('/settings')}
                className="px-6 py-2 border border-[#E2D6BD] text-[#675F4B] rounded-lg hover:bg-[#F0E8D7] whitespace-nowrap cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-[#3B4A2A] text-white rounded-lg hover:bg-[#2D3B1E] disabled:opacity-50 whitespace-nowrap cursor-pointer shadow shadow-[#3B4A2A]/30"
              >
                {loading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'social' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
              <h2 className="text-lg font-semibold text-[#1F2618] mb-2">Social Media Links</h2>
              <p className="text-sm text-gray-500 mb-6">Add your company's social media profiles. These links will appear on invoices and documents.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <i className="ri-facebook-circle-fill text-[#1877F2] mr-2"></i>
                    Facebook
                  </label>
                  <input
                    type="text"
                    placeholder="https://facebook.com/yourcompany"
                    value={companyInfo.facebook || ''}
                    onChange={(e) => handleInputChange('facebook', e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <i className="ri-instagram-fill text-[#E4405F] mr-2"></i>
                    Instagram
                  </label>
                  <input
                    type="text"
                    placeholder="https://instagram.com/yourcompany"
                    value={companyInfo.instagram || ''}
                    onChange={(e) => handleInputChange('instagram', e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <i className="ri-twitter-x-fill text-black mr-2"></i>
                    Twitter / X
                  </label>
                  <input
                    type="text"
                    placeholder="https://x.com/yourcompany"
                    value={companyInfo.twitter || ''}
                    onChange={(e) => handleInputChange('twitter', e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <i className="ri-linkedin-box-fill text-[#0A66C2] mr-2"></i>
                    LinkedIn
                  </label>
                  <input
                    type="text"
                    placeholder="https://linkedin.com/company/yourcompany"
                    value={companyInfo.linkedin || ''}
                    onChange={(e) => handleInputChange('linkedin', e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <i className="ri-youtube-fill text-[#FF0000] mr-2"></i>
                    YouTube
                  </label>
                  <input
                    type="text"
                    placeholder="https://youtube.com/@yourcompany"
                    value={companyInfo.youtube || ''}
                    onChange={(e) => handleInputChange('youtube', e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <i className="ri-tiktok-fill text-black mr-2"></i>
                    TikTok
                  </label>
                  <input
                    type="text"
                    placeholder="https://tiktok.com/@yourcompany"
                    value={companyInfo.tiktok || ''}
                    onChange={(e) => handleInputChange('tiktok', e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <i className="ri-whatsapp-fill text-[#25D366] mr-2"></i>
                    WhatsApp
                  </label>
                  <input
                    type="text"
                    placeholder="+1 809 555 1234"
                    value={companyInfo.whatsapp || ''}
                    onChange={(e) => handleInputChange('whatsapp', e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-4">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-[#3B4A2A] text-white rounded-lg hover:bg-[#2D3B1E] disabled:opacity-50 whitespace-nowrap cursor-pointer shadow shadow-[#3B4A2A]/30"
              >
                {loading ? 'Saving…' : 'Save Social Links'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'printers' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-[#1F2618]">Printer Configuration</h2>
                  <p className="text-sm text-gray-500">Configure printers for printing receipts and invoices</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setEditingPrinter(null);
                      setNewPrinterName('');
                      setNewPrinterType('network_raw');
                      setNewPrinterHost('');
                      setNewPrinterPort(9100);
                      setNewPrinterPaperWidth(80);
                      setNewPrinterAutoPrint(true);
                      setNewPrinterActive(true);
                      setShowPrinterModal(true);
                    }}
                    className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg hover:bg-[#2D3B1E] text-sm font-medium flex items-center gap-2"
                  >
                    <i className="ri-add-line"></i>
                    Add printer
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadPrinterInstructions}
                    className="px-4 py-2 border border-[#E2D6BD] text-[#675F4B] rounded-lg hover:bg-[#F0E8D7] text-sm font-medium"
                  >
                    Download instructions
                  </button>
                  <button
                    type="button"
                    onClick={handleReloadPrinters}
                    className="px-4 py-2 border border-[#E2D6BD] text-[#675F4B] rounded-lg hover:bg-[#F0E8D7] text-sm font-medium"
                  >
                    Reload
                  </button>
                </div>
              </div>

              {printers.length === 0 ? (
                <div className="text-sm text-gray-500">No printers configured.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-600 border-b border-[#E0E7C8]">
                        <th className="py-3 pr-4 font-medium">Name</th>
                        <th className="py-3 pr-4 font-medium">Area</th>
                        <th className="py-3 pr-4 font-medium">Type</th>
                        <th className="py-3 pr-4 font-medium">Destination</th>
                        <th className="py-3 pr-4 font-medium">Auto</th>
                        <th className="py-3 pr-4 font-medium">Active</th>
                        <th className="py-3 pr-0 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {printers.map((printer) => {
                        const destination = printer.type === 'network_raw' ? `${printer.host || ''}${printer.port ? `:${printer.port}` : ''}` : '-';
                        return (
                          <tr key={printer.id} className="border-b border-[#F3F6EA]">
                            <td className="py-3 pr-4 text-[#1F2618]">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{printer.name}</span>
                                {printer.is_default && (
                                  <span className="text-xs bg-[#3B4A2A] text-white px-2 py-0.5 rounded">Default</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 pr-4 text-gray-700">{printer.area}</td>
                            <td className="py-3 pr-4 text-gray-700">{printer.type}</td>
                            <td className="py-3 pr-4 text-gray-700">{destination || '-'}</td>
                            <td className="py-3 pr-4">
                              <span className={`text-xs px-2 py-1 rounded ${printer.auto_print ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                {printer.auto_print ? 'Yes' : 'No'}
                              </span>
                            </td>
                            <td className="py-3 pr-4">
                              <span className={`text-xs px-2 py-1 rounded ${printer.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                {printer.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="py-3 pr-0">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setEditingPrinter(printer);
                                    setNewPrinterName(printer.name);
                                    setNewPrinterType(printer.type);
                                    setNewPrinterHost(printer.host || '');
                                    setNewPrinterPort(printer.port || 9100);
                                    setNewPrinterPaperWidth(printer.paper_width_mm || 80);
                                    setNewPrinterAutoPrint(Boolean(printer.auto_print));
                                    setNewPrinterActive(Boolean(printer.is_active));
                                    setShowPrinterModal(true);
                                  }}
                                  className="p-2 text-gray-500 hover:text-[#3B4A2A] hover:bg-[#F0E8D7] rounded-lg"
                                >
                                  <i className="ri-edit-line"></i>
                                </button>
                                <button
                                  onClick={() => handleDeletePrinter(printer.id)}
                                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                >
                                  <i className="ri-delete-bin-line"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-[#1F2618]">Printer agents</h3>
                  <p className="text-sm text-gray-500">Local installations that claim jobs and print.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMessage({ type: 'success', text: 'Connect agent coming soon' })}
                    className="px-4 py-2 border border-[#E2D6BD] text-[#675F4B] rounded-lg hover:bg-[#F0E8D7] text-sm font-medium"
                  >
                    Connect agent
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessage({ type: 'success', text: 'Create agent coming soon' })}
                    className="px-4 py-2 border border-[#E2D6BD] text-[#675F4B] rounded-lg hover:bg-[#F0E8D7] text-sm font-medium"
                  >
                    Create agent
                  </button>
                </div>
              </div>

              {printerAgents.length === 0 ? (
                <div className="text-sm text-gray-500">No agents.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-600 border-b border-[#E0E7C8]">
                        <th className="py-3 pr-4 font-medium">Name</th>
                        <th className="py-3 pr-4 font-medium">Active</th>
                        <th className="py-3 pr-0 font-medium">Last seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printerAgents.map((agent) => (
                        <tr key={agent.id} className="border-b border-[#F3F6EA]">
                          <td className="py-3 pr-4 text-[#1F2618] font-medium">{agent.name}</td>
                          <td className="py-3 pr-4">
                            <span className={`text-xs px-2 py-1 rounded ${agent.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                              {agent.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-3 pr-0 text-gray-700">{agent.last_seen || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'register' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-[#1F2618]">Cash Registers</h2>
                  <p className="text-sm text-gray-500">Create and manage cash registers to assign to users</p>
                </div>
                <button
                  onClick={() => {
                    setEditingRegister(null);
                    setNewRegisterName('');
                    setShowRegisterModal(true);
                  }}
                  className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg hover:bg-[#2D3B1E] text-sm font-medium flex items-center gap-2"
                >
                  <i className="ri-add-line"></i>
                  Add Register
                </button>
              </div>

              {registers.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <i className="ri-funds-box-line text-4xl mb-3 block"></i>
                  <p>No cash registers configured</p>
                  <p className="text-sm">Click "Add Register" to create your first cash register</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {registers.map((register) => (
                    <div key={register.id} className="flex items-center justify-between p-4 border border-[#E2D6BD] rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-[#F0E8D7] rounded-lg flex items-center justify-center">
                          <i className="ri-funds-box-line text-[#3B4A2A]"></i>
                        </div>
                        <div>
                          <span className="font-medium text-[#1F2618]">{register.name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded ${register.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {register.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <button
                          onClick={() => {
                            setEditingRegister(register);
                            const extracted = String(register.name || '').match(/\d+/g)?.join('') || String(register.name || '');
                            setNewRegisterName(extracted);
                            setShowRegisterModal(true);
                          }}
                          className="p-2 text-gray-500 hover:text-[#3B4A2A] hover:bg-[#F0E8D7] rounded-lg"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => handleDeleteRegister(register.id)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-[#1F2618]">Assign Registers to Users</h3>
                  <p className="text-sm text-gray-500">Users come from the Users module. Assign one register per user.</p>
                </div>
              </div>

              {users.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <i className="ri-user-3-line text-4xl mb-3 block"></i>
                  <p>No users found</p>
                  <p className="text-sm">Create users in the Users module first</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {users.map((u) => {
                    const selected = registerAssignments[String(u.id)] || '';
                    return (
                      <div
                        key={u.id}
                        className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 border border-[#E2D6BD] rounded-lg"
                      >
                        <div>
                          <div className="font-medium text-[#1F2618]">{u.email || u.id}</div>
                          <div className="text-xs text-gray-500">{u.status || 'active'}</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={selected}
                            onChange={(e) => handleAssignRegister(String(u.id), e.target.value)}
                            className="px-3 py-2 border border-[#E2D6BD] rounded-lg bg-white text-sm"
                          >
                            <option value="">Unassigned</option>
                            {registers.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                          {selected && (
                            <button
                              type="button"
                              onClick={() => handleAssignRegister(String(u.id), '')}
                              className="px-3 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                            >
                              Unassign
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Register Modal */}
        {showRegisterModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-[#1F2618] mb-4">
                {editingRegister ? 'Edit Register' : 'Add New Register'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Register Number *
                  </label>
                  <input
                    type="text"
                    value={newRegisterName}
                    onChange={(e) => setNewRegisterName(e.target.value)}
                    placeholder="e.g., 1"
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 border border-[#E2D6BD] text-[#675F4B] rounded-lg hover:bg-[#F0E8D7]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRegister}
                  className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg hover:bg-[#2D3B1E]"
                >
                  {editingRegister ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Printer Modal */}
        {showPrinterModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-[#1F2618] mb-4">
                {editingPrinter ? 'Edit Printer' : 'Add New Printer'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Printer Name *
                  </label>
                  <input
                    type="text"
                    value={newPrinterName}
                    onChange={(e) => setNewPrinterName(e.target.value)}
                    placeholder="e.g., Receipt Printer, Kitchen Printer"
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type
                  </label>
                  <select
                    value={newPrinterType}
                    onChange={(e) => setNewPrinterType(e.target.value as PrinterConfig['type'])}
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                  >
                    <option value="network_raw">network_raw</option>
                    <option value="usb">usb</option>
                    <option value="windows">windows</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Host
                    </label>
                    <input
                      type="text"
                      value={newPrinterHost}
                      onChange={(e) => setNewPrinterHost(e.target.value)}
                      placeholder="192.168.1.100"
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Port
                    </label>
                    <input
                      type="number"
                      value={newPrinterPort}
                      onChange={(e) => setNewPrinterPort(parseInt(e.target.value) || 9100)}
                      placeholder="9100"
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Paper width (mm)
                    </label>
                    <input
                      type="number"
                      value={newPrinterPaperWidth}
                      onChange={(e) => setNewPrinterPaperWidth(parseInt(e.target.value) || 80)}
                      placeholder="80"
                      className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-white"
                    />
                  </div>
                  <div className="border border-[#E2D6BD] rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-[#1F2618]">Auto print</div>
                      <div className="text-xs text-gray-500">Creates jobs automatically when creating tickets.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewPrinterAutoPrint(v => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${newPrinterAutoPrint ? 'bg-[#3B4A2A]' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${newPrinterAutoPrint ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
                <div className="border border-[#E2D6BD] rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-[#1F2618]">Active</div>
                    <div className="text-xs text-gray-500">If disabled it will not receive jobs.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewPrinterActive(v => !v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${newPrinterActive ? 'bg-[#3B4A2A]' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${newPrinterActive ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowPrinterModal(false)}
                  className="px-4 py-2 border border-[#E2D6BD] text-[#675F4B] rounded-lg hover:bg-[#F0E8D7]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePrinter}
                  className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg hover:bg-[#2D3B1E]"
                >
                  {editingPrinter ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
