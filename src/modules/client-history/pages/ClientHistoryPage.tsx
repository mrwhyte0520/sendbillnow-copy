import { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import InvoiceBluePreview from '../../../components/common/InvoiceBluePreview';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { invoicesService } from '../../../services/database';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

type InvoiceHistoryItem = {
  id: string;
  description: string;
  qty: number;
  price: number;
  discount: number;
  total: number;
};

type InvoiceHistoryRecord = {
  id: string;
  invoiceNumber: string;
  businessName: string;
  date: string;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  items: InvoiceHistoryItem[];
};

type TopBuyingClient = {
  businessName: string;
  totalInvoices: number;
  totalAmountSpent: number;
};

type ExportInvoiceRecord = {
  invoiceNumber: string;
  businessName: string;
  date: string;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
};

const formatDate = (value: string) => {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatStatus = (value: string) => {
  if (!value) return 'Pending';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getStatusClasses = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === 'paid') return 'bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs rounded-md font-medium';
  if (normalized === 'cancelled') return 'bg-red-100 text-red-700 px-2 py-0.5 text-xs rounded-md font-medium';
  if (normalized === 'overdue') return 'bg-amber-100 text-amber-700 px-2 py-0.5 text-xs rounded-md font-medium';
  if (normalized === 'partial') return 'bg-blue-100 text-blue-700 px-2 py-0.5 text-xs rounded-md font-medium';
  return 'bg-slate-100 text-slate-700 px-2 py-0.5 text-xs rounded-md font-medium';
};

const buildExportRows = (invoices: ExportInvoiceRecord[]) =>
  invoices.map((invoice) => ({
    'Invoice Number': invoice.invoiceNumber,
    'Business Name': invoice.businessName,
    Date: formatDate(invoice.date),
    Subtotal: Number(invoice.subtotal.toFixed(2)),
    Tax: Number(invoice.tax.toFixed(2)),
    Total: Number(invoice.total.toFixed(2)),
    Status: formatStatus(invoice.status),
  }));

function exportInvoicesToCSV(invoices: ExportInvoiceRecord[]) {
  const rows = buildExportRows(invoices);
  const headers = ['Invoice Number', 'Business Name', 'Date', 'Subtotal', 'Tax', 'Total', 'Status'];
  const escapeValue = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const csvContent = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeValue(row[header as keyof typeof row])).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'invoices-export.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportInvoicesToExcel(invoices: ExportInvoiceRecord[]) {
  const rows = buildExportRows(invoices);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoices');
  XLSX.writeFile(workbook, 'invoices-export.xlsx');
}

function exportInvoicesToPDF(invoices: ExportInvoiceRecord[]) {
  const doc = new jsPDF();
  const totalRevenue = invoices.reduce((sum, invoice) => sum + invoice.total, 0);

  doc.setFontSize(16);
  doc.text('Invoice History Report', 14, 18);

  autoTable(doc, {
    startY: 28,
    head: [['Invoice #', 'Business Name', 'Date', 'Subtotal', 'Tax', 'Total', 'Status']],
    body: invoices.map((invoice) => [
      invoice.invoiceNumber,
      invoice.businessName,
      formatDate(invoice.date),
      currencyFormatter.format(invoice.subtotal),
      currencyFormatter.format(invoice.tax),
      currencyFormatter.format(invoice.total),
      formatStatus(invoice.status),
    ]),
    styles: {
      fontSize: 9,
    },
    headStyles: {
      fillColor: [37, 99, 235],
    },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 40;
  doc.setFontSize(11);
  doc.text(`Total Invoices: ${invoices.length}`, 14, finalY + 12);
  doc.text(`Total Revenue: ${currencyFormatter.format(totalRevenue)}`, 14, finalY + 20);
  doc.save('invoice-report.pdf');
}

export default function ClientHistoryPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [invoices, setInvoices] = useState<InvoiceHistoryRecord[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceHistoryRecord | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;

    const loadInvoices = async () => {
      if (!user?.id) {
        if (isMounted) {
          setInvoices([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError('');

      try {
        const data = await invoicesService.getAll(user.id);
        if (!isMounted) return;

        const mapped: InvoiceHistoryRecord[] = (data as any[]).map((invoice) => {
          const total = Number(invoice.total_amount) || 0;
          const subtotal = Number(invoice.subtotal) || Math.max(total - (Number(invoice.tax_amount) || 0), 0);
          const tax = Number(invoice.tax_amount) || Math.max(total - subtotal, 0);
          const items: InvoiceHistoryItem[] = ((invoice.invoice_lines as any[]) || []).map((line, index) => {
            const qty = Number(line.quantity) || 0;
            const price = Number(line.unit_price) || 0;
            const lineTotal = Number(line.line_total) || qty * price;
            const discount = Number(line.discount_percent) || Number(line.discount) || 0;

            return {
              id: String(line.id || `${invoice.id}-line-${index}`),
              description: String(line.description || 'Item'),
              qty,
              price,
              discount,
              total: lineTotal,
            };
          });

          return {
            id: String(invoice.id),
            invoiceNumber: String(invoice.invoice_number || invoice.id || ''),
            businessName: String(invoice.customers?.name || invoice.customer_name || invoice.business_name || 'Walk-in Customer'),
            date: String(invoice.invoice_date || invoice.created_at || ''),
            subtotal,
            tax,
            total,
            status: String(invoice.status || 'pending'),
            items,
          };
        });

        setInvoices(mapped);
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load invoices');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadInvoices();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const filteredInvoices = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return invoices;

    return invoices.filter((invoice) =>
      invoice.businessName.toLowerCase().includes(query) || invoice.invoiceNumber.toLowerCase().includes(query),
    );
  }, [invoices, searchTerm]);

  const topBuyingClients = useMemo<TopBuyingClient[]>(() => {
    const clientMap = new Map<string, TopBuyingClient>();

    invoices.forEach((invoice) => {
      const key = invoice.businessName;
      const existing = clientMap.get(key) || {
        businessName: invoice.businessName,
        totalInvoices: 0,
        totalAmountSpent: 0,
      };

      existing.totalInvoices += 1;
      existing.totalAmountSpent += invoice.total;
      clientMap.set(key, existing);
    });

    return Array.from(clientMap.values()).sort((left, right) => right.totalAmountSpent - left.totalAmountSpent);
  }, [invoices]);

  const visibleInvoiceIds = useMemo(() => filteredInvoices.map((invoice) => invoice.id), [filteredInvoices]);

  const selectedVisibleInvoicesCount = useMemo(
    () => visibleInvoiceIds.filter((invoiceId) => selectedInvoices.includes(invoiceId)).length,
    [selectedInvoices, visibleInvoiceIds],
  );

  const allVisibleSelected = filteredInvoices.length > 0 && selectedVisibleInvoicesCount === filteredInvoices.length;

  const exportInvoices = useMemo(() => {
    if (selectedInvoices.length > 0) {
      return invoices.filter((invoice) => selectedInvoices.includes(invoice.id));
    }

    return filteredInvoices;
  }, [filteredInvoices, invoices, selectedInvoices]);

  const toggleInvoiceSelection = (invoiceId: string) => {
    setSelectedInvoices((current) =>
      current.includes(invoiceId) ? current.filter((id) => id !== invoiceId) : [...current, invoiceId],
    );
  };

  const toggleSelectAllVisible = () => {
    setSelectedInvoices((current) => {
      if (allVisibleSelected) {
        return [];
      }

      return Array.from(new Set([...current, ...visibleInvoiceIds]));
    });
  };

  const clearSelection = () => {
    setSelectedInvoices([]);
  };

  const handleExport = (format: 'csv' | 'excel' | 'pdf') => {
    if (exportInvoices.length === 0) {
      setIsExportMenuOpen(false);
      return;
    }

    if (format === 'csv') {
      exportInvoicesToCSV(exportInvoices);
    }

    if (format === 'excel') {
      exportInvoicesToExcel(exportInvoices);
    }

    if (format === 'pdf') {
      exportInvoicesToPDF(exportInvoices);
    }

    setIsExportMenuOpen(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="rounded-2xl bg-gradient-to-r from-violet-700 to-blue-700 p-6 text-white shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-violet-100">Invoice History</p>
          <h1 className="mt-2 text-2xl font-bold md:text-3xl">Invoice History</h1>
          <p className="mt-2 max-w-3xl text-sm text-violet-50">
            Review real invoices generated by the system, search by client or invoice number, and inspect full invoice details.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_2fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Top Buying Clients</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">Highest spend ranking</h2>
            <div className="mt-4 space-y-3">
              {topBuyingClients.length > 0 ? topBuyingClients.map((client, index) => (
                <div key={`${client.businessName}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{index + 1}. {client.businessName}</p>
                      <p className="mt-1 text-xs text-slate-500">Total Invoices: {client.totalInvoices}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Total Amount Spent</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-800">{currencyFormatter.format(client.totalAmountSpent)}</p>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No invoice history available yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Invoice Records</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">All Generated Invoices</h2>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                <div className="w-full sm:w-80">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search by business name or invoice #"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div className="relative w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsExportMenuOpen((current) => !current)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 sm:w-auto"
                  >
                    Export
                  </button>
                  {isExportMenuOpen ? (
                    <div className="absolute right-0 z-10 mt-2 flex w-full min-w-[200px] flex-col rounded-xl border border-slate-200 bg-white p-2 shadow-lg sm:w-auto">
                      <button
                        type="button"
                        onClick={() => handleExport('pdf')}
                        className="rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        Export as PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport('csv')}
                        className="rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        Export as CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport('excel')}
                        className="rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        Export as Excel
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                {selectedInvoices.length} {selectedInvoices.length === 1 ? 'invoice' : 'invoices'} selected
              </p>
              <button
                type="button"
                onClick={clearSelection}
                className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:w-auto"
              >
                Clear selection
              </button>
            </div>

            {loading ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                Loading invoices...
              </div>
            ) : error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            ) : (
              <>
                <div className="mt-4 hidden lg:block">
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                            <input
                              type="checkbox"
                              checked={allVisibleSelected}
                              onChange={toggleSelectAllVisible}
                              aria-label="Select all visible invoices"
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Invoice #</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Business Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Date</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Subtotal</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Tax</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Total</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {filteredInvoices.map((invoice) => (
                          <tr
                            key={invoice.id}
                            onClick={() => setSelectedInvoice(invoice)}
                            className="cursor-pointer transition-colors hover:bg-slate-50"
                          >
                            <td
                              className="px-4 py-4 text-sm text-slate-700"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={selectedInvoices.includes(invoice.id)}
                                onChange={() => toggleInvoiceSelection(invoice.id)}
                                aria-label={`Select invoice ${invoice.invoiceNumber}`}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-4 py-4 text-sm font-semibold text-slate-900">{invoice.invoiceNumber}</td>
                            <td className="px-4 py-4 text-sm text-slate-900">{invoice.businessName}</td>
                            <td className="px-4 py-4 text-sm text-slate-700">{formatDate(invoice.date)}</td>
                            <td className="px-4 py-4 text-right text-sm text-slate-700">{currencyFormatter.format(invoice.subtotal)}</td>
                            <td className="px-4 py-4 text-right text-sm text-slate-700">{currencyFormatter.format(invoice.tax)}</td>
                            <td className="px-4 py-4 text-right text-sm font-semibold text-slate-900">{currencyFormatter.format(invoice.total)}</td>
                            <td className="px-4 py-4 text-sm text-slate-700">
                              <span className={getStatusClasses(invoice.status)}>{formatStatus(invoice.status)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4 space-y-3 lg:hidden">
                  {filteredInvoices.map((invoice) => (
                    <button
                      key={invoice.id}
                      type="button"
                      onClick={() => setSelectedInvoice(invoice)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50"
                    >
                      <div
                        className="mb-3 flex items-center justify-between"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={selectedInvoices.includes(invoice.id)}
                            onChange={() => toggleInvoiceSelection(invoice.id)}
                            aria-label={`Select invoice ${invoice.invoiceNumber}`}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          Select invoice
                        </label>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{invoice.invoiceNumber}</p>
                          <p className="mt-1 text-sm text-slate-700">{invoice.businessName}</p>
                        </div>
                        <span className={getStatusClasses(invoice.status)}>{formatStatus(invoice.status)}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-slate-500">Date</p>
                          <p className="mt-1 font-medium text-slate-900">{formatDate(invoice.date)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Total</p>
                          <p className="mt-1 font-medium text-slate-900">{currencyFormatter.format(invoice.total)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Status</p>
                          <p className="mt-1 font-medium text-slate-900">{formatStatus(invoice.status)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {filteredInvoices.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    No invoices match your search.
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        {selectedInvoice ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto">
              <InvoiceBluePreview
                invoiceNumber={selectedInvoice.invoiceNumber}
                businessName={selectedInvoice.businessName}
                dateLabel={formatDate(selectedInvoice.date)}
                dueDateLabel={formatDate(selectedInvoice.date)}
                subtotal={currencyFormatter.format(selectedInvoice.subtotal)}
                tax={currencyFormatter.format(selectedInvoice.tax)}
                total={currencyFormatter.format(selectedInvoice.total)}
                notes={null}
                items={selectedInvoice.items.map((item) => ({
                  id: item.id,
                  description: item.description,
                  qty: item.qty,
                  price: item.price,
                  total: item.total,
                }))}
                onClose={() => setSelectedInvoice(null)}
              />
            </div>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
