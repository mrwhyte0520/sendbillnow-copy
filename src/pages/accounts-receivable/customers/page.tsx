import { useEffect, useRef, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { customersService, salesRepsService, customerTypesService, paymentTermsService, settingsService } from '../../../services/database';
import { exportToExcelWithHeaders, addPdfBrandedHeader, getPdfTableStyles } from '../../../utils/exportImportUtils';

interface Customer {
  id: string;
  name: string;
  document: string;
  phone: string;
  email: string;
  address: string;
  creditLimit: number;
  currentBalance: number;
  status: 'active' | 'inactive' | 'blocked';
  documentType?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  customerType?: string | null;
  paymentTerms?: string | null;
  invoiceType?: string | null;
  ncfType?: string | null;
  salesperson?: string | null;
  salesRepId?: string | null;
  paymentTermId?: string | null;
}

export default function CustomersPage() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [salesReps, setSalesReps] = useState<Array<{ id: string; name: string; is_active: boolean }>>([]);
  const [customerTypes, setCustomerTypes] = useState<any[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<Array<{ id: string; name: string; days?: number }>>([]);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Estados para máscaras de formato
  const [documentValue, setDocumentValue] = useState('');
  const [phoneValue, setPhoneValue] = useState('');
  const [contactPhoneValue, setContactPhoneValue] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('');

  // Formatear teléfono: 809-000-0000
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  // Formatear RNC: 1-01-12345-6 (9 dígitos)
  const formatRNC = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length <= 1) return digits;
    if (digits.length <= 3) return `${digits.slice(0, 1)}-${digits.slice(1)}`;
    if (digits.length <= 8) return `${digits.slice(0, 1)}-${digits.slice(1, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 1)}-${digits.slice(1, 3)}-${digits.slice(3, 8)}-${digits.slice(8)}`;
  };

  // Formatear Cédula: 000-0000000-0 (11 dígitos)
  const formatCedula = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`;
  };

  // Formatear documento según tipo
  const formatDocument = (value: string, docType: string) => {
    if (docType === 'rnc') return formatRNC(value);
    if (docType === 'cedula') return formatCedula(value);
    return value; // Para pasaporte y otros, sin formato
  };

  const loadCustomers = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const list = await customersService.getAll(user.id);
      setCustomers(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      await loadCustomers();
      if (!user?.id) return;
      const [reps, types, terms] = await Promise.all([
        salesRepsService.getAll(user.id),
        customerTypesService.getAll(user.id),
        paymentTermsService.getAll(user.id),
      ]);
      setSalesReps((reps || []).filter((r: any) => r.is_active));
      setCustomerTypes(types || []);
      const mappedTerms = (terms || []).map((t: any) => ({
        id: t.id as string,
        name: t.name as string,
        days: typeof t.days === 'number' ? t.days : undefined,
      }));
      setPaymentTerms(mappedTerms);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const getCustomerStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-[#e3edd3] text-[#2f3e1e]';
      case 'inactive':
        return 'bg-[#f3ecda] text-[#6b5c3b]';
      case 'blocked':
        return 'bg-[#f6d6ce] text-[#7a2e1b]';
      default:
        return 'bg-[#f3ecda] text-[#6b5c3b]';
    }
  };

  const getCustomerStatusName = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'inactive': return 'Inactive';
      case 'blocked': return 'Blocked';
      default: return 'Unknown';
    }
  };

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         customer.document.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || customer.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const exportToPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF();
    const pdfStyles = getPdfTableStyles();

    // Add branded header with logo
    const startY = await addPdfBrandedHeader(doc, 'Customer Report');
    
    const activeCustomers = customers.filter(c => c.status === 'active').length;
    const totalCreditLimit = customers.reduce((sum, c) => sum + c.creditLimit, 0);
    const totalBalance = customers.reduce((sum, c) => sum + c.currentBalance, 0);
    
    doc.setFontSize(12);
    doc.setTextColor(51, 51, 51);
    doc.text('Customer Stats', 20, startY);
    
    const statsData = [
      ['Metric', 'Value'],
      ['Total Customers', customers.length.toString()],
      ['Active Customers', activeCustomers.toString()],
      ['Total Credit Limit', ` ${totalCreditLimit.toLocaleString()}`],
      ['Outstanding Balance', ` ${totalBalance.toLocaleString()}`]
    ];
    
    (doc as any).autoTable({
      startY: startY + 5,
      head: [statsData[0]],
      body: statsData.slice(1),
      theme: 'grid',
      ...pdfStyles
    });
    
    doc.setFontSize(14);
    doc.text('Customer Detail', 20, (((doc as any).lastAutoTable?.finalY) ?? 70) + 20);
    
    const customerData = filteredCustomers.map(customer => [
      customer.name,
      customer.document,
      customer.phone,
      customer.email,
      ` ${customer.creditLimit.toLocaleString()}`,
      ` ${customer.currentBalance.toLocaleString()}`,
      getCustomerStatusName(customer.status)
    ]);
    
    (doc as any).autoTable({
      startY: ((((doc as any).lastAutoTable?.finalY) ?? 70) + 30),
      head: [['Customer', 'Document', 'Phone', 'Email', 'Credit Limit', 'Current Balance', 'Status']],
      body: customerData,
      theme: 'striped',
      headStyles: { fillColor: [168, 85, 247] },
      styles: { fontSize: 8 }
    });
    
    doc.save(`customers-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = async () => {
    let companyName = '';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName = (info as any).name || (info as any).company_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      console.error('Error obteniendo información de la empresa para Excel de clientes:', error);
    }

    const todayIso = new Date().toISOString().split('T')[0];
    const todayLocal = new Date().toLocaleDateString();

    const headers = [
      { key: 'name', title: 'Customer' },
      { key: 'document', title: 'Document' },
      { key: 'phone', title: 'Phone' },
      { key: 'email', title: 'Email' },
      { key: 'address', title: 'Address' },
      { key: 'creditLimit', title: 'Credit Limit' },
      { key: 'currentBalance', title: 'Current Balance' },
      { key: 'status', title: 'Status' },
    ];

    const rows = filteredCustomers.map((customer) => ({
      name: customer.name,
      document: customer.document,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      creditLimit: customer.creditLimit,
      currentBalance: customer.currentBalance,
      status: getCustomerStatusName(customer.status),
    }));

    if (!rows.length) {
      alert('There are no customers to export with the current filters.');
      return;
    }

    exportToExcelWithHeaders(
      rows,
      headers,
      `customers-${todayIso}`,
      'Customers',
      [28, 18, 16, 28, 40, 18, 18, 14],
      {
        title: `Customer Report - ${todayLocal}`,
        companyName,
      },
    );
  };

  const handleNewCustomer = () => {
    setSelectedCustomer(null);
    setDocumentValue('');
    setPhoneValue('');
    setContactPhoneValue('');
    setSelectedDocType('');
    setShowCustomerModal(true);
  };

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSelectedDocType((customer as any)?.documentType || '');
    setDocumentValue(formatDocument(customer.document || '', (customer as any)?.documentType || ''));
    setPhoneValue(formatPhone(customer.phone || ''));
    setContactPhoneValue(formatPhone((customer as any)?.contactPhone || ''));
    setShowCustomerModal(true);
  };

  const handleViewCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowCustomerDetails(true);
  };

  const handleCustomerStatement = (customer: Customer) => {
    alert(`Statement for ${customer.name}:\n\nCurrent balance:  ${customer.currentBalance.toLocaleString()}\nCredit limit:  ${customer.creditLimit.toLocaleString()}`);
  };

  const handleCustomerTypeSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const typeId = e.target.value;
    if (!typeId || !formRef.current) return;
    const selectedType = customerTypes.find((t: any) => t.id === typeId);
    if (!selectedType) return;

    const form = formRef.current;
    const creditLimitInput = form.elements.namedItem('creditLimit') as HTMLInputElement | null;
    if (creditLimitInput) {
      const currentValue = creditLimitInput.value.trim();
      const suggested = Number(selectedType.creditLimit) || 0;
      if ((!currentValue || currentValue === '0' || currentValue === '0.00') && suggested > 0) {
        creditLimitInput.value = String(suggested);
      }
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id) {
      alert('You must sign in to save customers.');
      return;
    }
    const formData = new FormData(e.currentTarget);

    const paymentTermId = String(formData.get('paymentTermId') || '');
    const selectedPaymentTerm = paymentTerms.find((t) => t.id === paymentTermId);
    const paymentTermLabel = selectedPaymentTerm ? selectedPaymentTerm.name : '';
    const address1 = String(formData.get('address1') || '').trim();
    const city = String(formData.get('city') || '').trim();
    const state = String(formData.get('state') || '').trim();
    const zip = String(formData.get('zip') || '').trim();
    const addressParts = [
      address1,
      [city, state, zip].filter(Boolean).join(', ').replace(/,\s*,/g, ',').trim(),
    ].filter(Boolean);
    const addressCombined = addressParts.join('\n');

    const payload = {
      name: String(formData.get('name') || ''),
      document: String(formData.get('document') || ''),
      phone: String(formData.get('phone') || ''),
      email: String(formData.get('email') || ''),
      address: addressCombined,
      creditLimit: Number(formData.get('creditLimit') || 0),
      status: String(formData.get('status') || 'active') as Customer['status'],
      documentType: String(formData.get('documentType') || ''),
      contactName: String(formData.get('contactName') || ''),
      contactPhone: String(formData.get('contactPhone') || ''),
      contactEmail: String(formData.get('contactEmail') || ''),
      customerType: String(formData.get('customerType') || ''),
      paymentTerms: paymentTermLabel,
      invoiceType: String(formData.get('invoiceType') || ''),
      ncfType: String(formData.get('ncfType') || ''),
      salesperson: String(formData.get('salesperson') || ''),
      salesRepId: String(formData.get('salesRepId') || '') || null,
      paymentTermId: paymentTermId || null,
    };
    try {
      if (selectedCustomer) {
        await customersService.update(selectedCustomer.id, payload);
      } else {
        await customersService.create(user.id, payload);
      }
      await loadCustomers();
      alert(selectedCustomer ? 'Customer updated successfully' : 'Customer created successfully');
      setShowCustomerModal(false);
      setSelectedCustomer(null);
    } catch (error) {
      alert('Error saving the customer');
      console.error('Error saving the customer:', error);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5] min-h-screen">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#1e2814] drop-shadow-sm">Customer Management</h1>
            <p className="text-sm text-[#4c5535]">Control balances, credit limits, and receivables from a unified workspace.</p>
          </div>
          <button 
            onClick={handleNewCustomer}
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-br from-[#008000] to-[#006600] text-white shadow-[0_4px_15px_rgb(0,128,0,0.3)] hover:from-[#006600] hover:to-[#005500] hover:shadow-[0_6px_20px_rgb(0,128,0,0.4)] hover:-translate-y-0.5 transition-all duration-300 whitespace-nowrap font-semibold"
          >
            <i className="ri-user-add-line mr-2"></i>
            New Customer
          </button>
        </div>

        {/* Filters and Export */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="ri-search-line text-gray-400"></i>
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-[#d6cfbf] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] text-sm text-gray-800 placeholder:text-gray-500"
                placeholder="Search by name or document..."
              />
            </div>
          </div>
          <div className="w-full md:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-3 border border-[#d6cfbf] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] text-sm pr-8 text-gray-800"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
          <div className="flex space-x-2">
            <button 
              onClick={exportToPDF}
              className="px-4 py-2 rounded-lg border border-[#d6cfbf] bg-[#f7f0df] text-[#2f3e1e] hover:bg-[#ede3cb] transition-colors whitespace-nowrap"
            >
              <i className="ri-file-pdf-line mr-2"></i>
              PDF
            </button>
            <button 
              onClick={exportToExcel}
              className="px-4 py-2 rounded-lg bg-[#3f5d2a] text-white hover:bg-[#2d451f] transition-colors whitespace-nowrap shadow-sm"
            >
              <i className="ri-file-excel-line mr-2"></i>
              Excel
            </button>
          </div>
        </div>

        {loading && (
          <div className="mb-2 text-sm text-gray-500">Loading customers...</div>
        )}

        <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#e8e0d0]">
              <thead className="bg-gradient-to-r from-[#f8f6f0] to-[#f0ece0]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Document
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#e8e0d0]">
                {filteredCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="hover:bg-gradient-to-r hover:from-[#f8f6f0] hover:to-transparent transition-all duration-200"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                        <div className="text-sm text-gray-500">{customer.address}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {customer.document}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{customer.contactName || customer.phone}</div>
                      <div className="text-sm text-gray-500">
                        {customer.contactPhone || ''}
                        {customer.contactPhone && customer.contactEmail ? ' / ' : ''}
                        {customer.contactEmail || customer.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCustomerStatusColor(
                          customer.status,
                        )}`}
                      >
                        {getCustomerStatusName(customer.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditCustomer(customer)}
                          className="text-[#2f3e1e] hover:text-[#1b250f]"
                          title="Edit customer"
                          type="button"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => handleViewCustomer(customer)}
                          className="text-[#4c5535] hover:text-[#2f3e1e]"
                          title="View details"
                          type="button"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        <button
                          onClick={() => handleCustomerStatement(customer)}
                          className="text-[#6b4a2b] hover:text-[#4c2f17]"
                          title="Account statement"
                          type="button"
                        >
                          <i className="ri-file-list-line"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Customer Modal */}
        {showCustomerModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  {selectedCustomer ? 'Edit Customer' : 'New Customer'}
                </h3>
                <button
                  onClick={() => {
                    setShowCustomerModal(false);
                    setSelectedCustomer(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>

              <form onSubmit={handleSaveCustomer} ref={formRef} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Business Name
                    </label>
                    <input
                      type="text"
                      required
                      name="name"
                      defaultValue={selectedCustomer?.name || ''}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                      placeholder="Name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone
                    </label>
                    <input
                      type="tel"
                      required
                      name="phone"
                      value={phoneValue}
                      onChange={(e) => setPhoneValue(formatPhone(e.target.value))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                      placeholder="555-555-5555"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      required
                      name="email"
                      defaultValue={selectedCustomer?.email || ''}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                      placeholder="client@email.com"
                    />
                  </div>
                </div>

                {(() => {
                  const raw = String(selectedCustomer?.address || '');
                  const normalized = raw.replace(/\r\n/g, '\n');
                  const lines = normalized.split('\n').map((x) => x.trim()).filter(Boolean);
                  const firstLine = lines[0] || '';
                  const secondLine = lines.slice(1).join(' ').trim();
                  const segs = secondLine
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean);
                  const cityDefault = segs[0] || '';
                  const rest = segs.slice(1).join(' ').trim();
                  const restTokens = rest.split(/\s+/).filter(Boolean);
                  const stateDefault = restTokens[0] || '';
                  const zipDefault = restTokens.slice(1).join(' ').trim();

                  return (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                        <textarea
                          rows={2}
                          name="address1"
                          defaultValue={firstLine}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                          placeholder="Street address"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                          <input
                            type="text"
                            name="city"
                            defaultValue={cityDefault}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                            placeholder="City"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                          <input
                            type="text"
                            name="state"
                            defaultValue={stateDefault}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                            placeholder="State"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Zip</label>
                          <input
                            type="text"
                            name="zip"
                            defaultValue={zipDefault}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                            placeholder="Zip"
                          />
                        </div>
                      </div>
                    </>
                  );
                })()}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Contact person
                    </label>
                    <input
                      type="text"
                      name="contactName"
                      defaultValue={(selectedCustomer as any)?.contactName || ''}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                      placeholder="Contact name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Contact phone
                    </label>
                    <input
                      type="tel"
                      name="contactPhone"
                      value={contactPhoneValue}
                      onChange={(e) => setContactPhoneValue(formatPhone(e.target.value))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                      placeholder="555-555-5555"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Contact email
                    </label>
                    <input
                      type="email"
                      name="contactEmail"
                      defaultValue={(selectedCustomer as any)?.contactEmail || ''}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                      placeholder="contact@company.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status
                    </label>
                    <select
                      name="status"
                      defaultValue={selectedCustomer?.status || 'active'}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] pr-8"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:space-x-3 space-y-3 md:space-y-0 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomerModal(false);
                      setSelectedCustomer(null);
                    }}
                    className="flex-1 border border-[#d6cfbf] text-[#2f3e1e] py-2 rounded-lg hover:bg-[#f7f0df] transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#2f3e1e] text-white py-2 rounded-lg hover:bg-[#243015] transition-colors whitespace-nowrap"
                  >
                    {selectedCustomer ? 'Update' : 'Create'} Customer
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showCustomerDetails && selectedCustomer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-[#e6dec8]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-[#1e2814]">Customer Details</h3>
                <button
                  onClick={() => {
                    setShowCustomerDetails(false);
                    setSelectedCustomer(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Name / Business Name</label>
                    <p className="text-lg font-semibold text-gray-900">{selectedCustomer.name}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500">Document (RNC / ID)</label>
                    <p className="text-gray-900">{selectedCustomer.document}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500">Phone</label>
                    <p className="text-gray-900">{selectedCustomer.phone}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500">Email</label>
                    <p className="text-gray-900">{selectedCustomer.email}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Address</label>
                    <p className="text-gray-900">{selectedCustomer.address}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500">Credit limit</label>
                    <p className="text-lg font-semibold text-[#2f3e1e]">
                      {selectedCustomer.creditLimit.toLocaleString()}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500">Current balance</label>
                    <p className="text-lg font-semibold text-[#6b4a2b]">
                      {selectedCustomer.currentBalance.toLocaleString()}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500">Status</label>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCustomerStatusColor(
                        selectedCustomer.status,
                      )}`}
                    >
                      {getCustomerStatusName(selectedCustomer.status)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-3 mt-8">
                <button
                  onClick={() => {
                    setShowCustomerDetails(false);
                    setShowCustomerModal(true);
                  }}
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[#2f3e1e] text-white hover:bg-[#243015] transition-colors"
                >
                  <i className="ri-edit-line mr-2"></i>
                  Edit Customer
                </button>
                <button
                  onClick={() => handleCustomerStatement(selectedCustomer)}
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 rounded-lg border border-[#d6cfbf] bg-[#f7f0df] text-[#2f3e1e] hover:bg-[#ede3cb] transition-colors"
                >
                  <i className="ri-file-list-line mr-2"></i>
                  Account Statement
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}