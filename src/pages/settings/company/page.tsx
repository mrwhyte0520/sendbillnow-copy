
import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { settingsService } from '../../../services/database';

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
}

export default function CompanySettingsPage() {
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

  return (
    <DashboardLayout>
      <div className="space-y-6 bg-[#F8F3E7] min-h-full p-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#3B4A2A] to-[#1F2616] rounded-2xl shadow-lg shadow-[#1F2616]/30 border border-[#2A351E] p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Company Information</h1>
              <p className="text-[#CFE6AB] mt-1">
                Configure the basic details for your company
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

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Company Form */}
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
                  <label className="px-4 py-2 bg-[#008000] text-white rounded-lg hover:bg-[#006600] cursor-pointer transition-colors text-sm font-medium">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  RNC/RUC *
                </label>
                <input
                  type="text"
                  required
                  value={companyInfo.ruc}
                  onChange={(e) => handleInputChange('ruc', e.target.value)}
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
                  type="url"
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
              className="px-6 py-2 bg-[#927B4E] text-white rounded-lg hover:bg-[#7D683E] disabled:opacity-50 whitespace-nowrap cursor-pointer shadow shadow-[#927B4E]/30"
            >
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
