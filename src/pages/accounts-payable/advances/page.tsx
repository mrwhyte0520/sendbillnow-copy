  import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import QRCode from 'qrcode';
import { useAuth } from '../../../hooks/useAuth';
import { useBankCatalog } from '../../../hooks/useBankCatalog';
import { apSupplierAdvancesService, suppliersService, chartAccountsService, settingsService } from '../../../services/database';
import { formatMoney } from '../../../utils/numberFormat';

const palette = {
  cream: '#F6F1E7',
  green: '#2F4F30',
  greenDark: '#1F2B1A',
  greenMid: '#4B5E2F',
  greenSoft: '#7E8F63',
  badgeNeutral: '#E5DCC3',
};

interface SupplierAdvance {
  id: string;
  number: string;
  date: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Applied' | 'Rejected';
  dueDate: string | null;
  remainingBalance: number;
  appliedAmount: number;
}

export default function AdvancesPage() {
  const { user } = useAuth();
  const { banks: bankAccounts } = useBankCatalog({
    userId: user?.id || null,
  });

  const [showModal, setShowModal] = useState(false);
  const [editingAdvance, setEditingAdvance] = useState<SupplierAdvance | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');

  const [advances, setAdvances] = useState<SupplierAdvance[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    supplierId: '',
    amount: '',
    reason: '',
    dueDate: '',
    transactionDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'transfer',
    bankId: '',
    documentNumber: '',
    documentDate: new Date().toISOString().split('T')[0],
    accountId: '',
  });

  const loadSuppliers = async () => {
    if (!user?.id) {
      setSuppliers([]);
      return;
    }
    try {
      const rows = await suppliersService.getAll(user.id);
      setSuppliers((rows || []).map((s: any) => ({ id: String(s.id), name: s.name || '' })));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error cargando proveedores para anticipos CxP', error);
      setSuppliers([]);
    }
  };

  const loadBanksAndAccounts = async () => {
    if (!user?.id) {
      setAccounts([]);
      return;
    }
    try {
      const accountRows = await chartAccountsService.getAll(user.id);
      const assetAccounts = (accountRows || []).filter((acc: any) => {
        if (acc.allow_posting === false) return false;
        const type = (acc.type || acc.account_type || '').toString().toLowerCase();
        return type.includes('asset') || type.includes('activo');
      });
      setAccounts(assetAccounts);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error cargando cuentas contables para anticipos CxP', error);
      setAccounts([]);
    }
  };

  const mapDbStatusToUi = (status: string | null | undefined): SupplierAdvance['status'] => {
    switch (status) {
      case 'approved':
        return 'Approved';
      case 'applied':
        return 'Applied';
      case 'cancelled':
        return 'Rejected';
      default:
        return 'Pending';
    }
  };

  const mapUiStatusToDb = (status: SupplierAdvance['status']): string => {
    switch (status) {
      case 'Approved':
        return 'approved';
      case 'Applied':
        return 'applied';
      case 'Rejected':
        return 'cancelled';
      default:
        return 'pending';
    }
  };

  const loadAdvances = async () => {
    if (!user?.id) {
      setAdvances([]);
      return;
    }
    try {
      const rows = await apSupplierAdvancesService.getAll(user.id);
      const mapped: SupplierAdvance[] = (rows || []).map((a: any) => {
        const amount = Number(a.amount) || 0;
        const applied = Number(a.applied_amount) || 0;
        const balance = Number(a.balance_amount) || (amount - applied);
        return {
          id: String(a.id),
          number: a.advance_number || '',
          date: a.advance_date || (a.created_at ? String(a.created_at).slice(0, 10) : ''),
          supplierId: String(a.supplier_id),
          supplierName: (a.suppliers as any)?.name || 'Supplier',

          amount,
          reason: a.description || '',
          status: mapDbStatusToUi(a.status),
          dueDate: a.due_date || null,
          remainingBalance: balance,
          appliedAmount: applied,
        };
      });
      setAdvances(mapped);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error cargando anticipos a suplidores', error);
      setAdvances([]);
    }
  };

  useEffect(() => {
    loadSuppliers();
    loadAdvances();
    loadBanksAndAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filteredAdvances = advances.filter((advance) => {
    return filterStatus === 'all' || advance.status === filterStatus;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      alert('You must sign in to record supplier advances.');
      return;
    }

    const amountNumber = Number(formData.amount);
    if (!formData.supplierId || !formData.reason.trim() || isNaN(amountNumber) || amountNumber <= 0) {
      alert('Supplier, reason, and a valid amount are required.');
      return;
    }

    if (!formData.transactionDate) {
      alert('Transaction date is required.');
      return;
    }

    if (!formData.paymentMethod) {
      alert('Select a payment method for the advance.');
      return;
    }

    if ((formData.paymentMethod === 'check' || formData.paymentMethod === 'transfer') && !formData.documentNumber.trim()) {
      alert('Document number is required for checks or transfers.');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const advanceNumber = editingAdvance?.number || `ADV-${new Date().getFullYear()}-${String(advances.length + 1).padStart(3, '0')}`;

    try {
      if (editingAdvance) {
        const dbStatus = mapUiStatusToDb(editingAdvance.status);
        const appliedAmount = editingAdvance.appliedAmount;
        const balanceAmount = amountNumber - appliedAmount;

        await apSupplierAdvancesService.updateStatus(editingAdvance.id, dbStatus, {
          appliedAmount,
          balanceAmount,
        });

        // Nota: no tenemos un método update completo en el servicio, así que solo actualizamos montos/estatus.
        // Para cambios más profundos se podría ampliar el servicio con un método update similar a create.
      } else {
        await apSupplierAdvancesService.create(user.id, {
          supplier_id: formData.supplierId,
          advance_number: advanceNumber,
          advance_date: today,
          amount: amountNumber,
          reference: formData.documentNumber || null,
          description: formData.reason,
          status: 'pending',
          applied_amount: 0,
          balance_amount: amountNumber,
          payment_method: formData.paymentMethod,
          transaction_date: formData.transactionDate,
          bank_id: formData.bankId || null,
          document_number: formData.documentNumber || null,
          document_date: formData.documentDate || null,
          account_id: formData.accountId || null,
        });
      }

      await loadAdvances();
      resetForm();
      alert(editingAdvance ? 'Advance updated successfully.' : 'Advance created successfully.');
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Error guardando anticipo de suplidor', error);
      alert(error?.message || 'Could not save the advance.');
    }
  };

  const resetForm = () => {
    setFormData({
      supplierId: '',
      amount: '',
      reason: '',
      dueDate: '',
      transactionDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'transfer',
      bankId: '',
      documentNumber: '',
      documentDate: new Date().toISOString().split('T')[0],
      accountId: '',
    });
    setEditingAdvance(null);
    setShowModal(false);
  };

  const handleEdit = (advance: SupplierAdvance) => {
    setEditingAdvance(advance);
    setFormData({
      supplierId: advance.supplierId,
      amount: advance.amount.toString(),
      reason: advance.reason,
      dueDate: advance.dueDate || '',
      transactionDate: advance.date || new Date().toISOString().split('T')[0],
      paymentMethod: 'transfer',
      bankId: '',
      documentNumber: '',
      documentDate: new Date().toISOString().split('T')[0],
      accountId: '',
    });
    setShowModal(true);
  };

  const handleApprove = async (id: string) => {
    const advance = advances.find(a => a.id === id);
    if (!advance) return;
    if (!confirm('Approve this advance?')) return;
    try {
      await apSupplierAdvancesService.updateStatus(id, 'approved', {
        appliedAmount: advance.appliedAmount,
        balanceAmount: advance.remainingBalance,
      });
      await loadAdvances();
      alert('Advance approved.');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error aprobando anticipo de suplidor', error);
      alert('The advance could not be approved.');
    }
  };

  const handleReject = async (id: string) => {
    const advance = advances.find(a => a.id === id);
    if (!advance) return;
    if (!confirm('Reject this advance?')) return;
    try {
      await apSupplierAdvancesService.updateStatus(id, 'cancelled', {
        appliedAmount: advance.appliedAmount,
        balanceAmount: advance.remainingBalance,
      });
      await loadAdvances();
      alert('Advance rejected.');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error rechazando anticipo de suplidor', error);
      alert('The advance could not be rejected.');
    }
  };

  const handlePrintAdvance = async (advance: SupplierAdvance) => {
    let companyName = 'ContaBi';
    let companyRnc = '';
    let companyPhone = '';
    let companyEmail = '';
    let companyAddress = '';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info) {
        companyName = (info as any).name || (info as any).company_name || 'ContaBi';
        companyRnc = (info as any).rnc || (info as any).ruc || (info as any).tax_id || '';
        companyPhone = (info as any).phone || '';
        companyEmail = (info as any).email || '';
        companyAddress = (info as any).address || '';
      }
    } catch { /* usar defaults */ }

    const supplierName = advance.supplierName;

    let qrDataUrl = '';
    try {
      const qrUrl = `${window.location.origin}/document/supplier-advance/${encodeURIComponent(advance.id)}`;
      qrDataUrl = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'M', margin: 1, width: 160 });
    } catch { qrDataUrl = ''; }

    const printWindow = window.open('', '_blank');
    if (!printWindow) { alert('No se pudo abrir la ventana de impresión'); return; }

    const advanceDate = advance.date ? new Date(advance.date).toLocaleDateString('es-DO') : '';
    const dueDate = advance.dueDate ? new Date(advance.dueDate).toLocaleDateString('es-DO') : '';

    const html = `
      <html>
        <head>
          <title>Anticipo ${advance.number}</title>
          <style>
            :root { --primary:#0b2a6f; --accent:#19a34a; --text:#111827; --muted:#6b7280; --border:#e5e7eb; --bg:#ffffff; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 28px; color: var(--text); background: var(--bg); }
            .top { display:grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; align-items: start; }
            .company-name { font-weight: 800; font-size: 18px; color: var(--primary); }
            .company-meta { font-size: 12px; color: var(--muted); line-height: 1.35; }
            .doc { text-align: right; }
            .doc-title { font-size: 44px; font-weight: 800; color: #9ca3af; letter-spacing: 1px; line-height: 1; }
            .doc-number { margin-top: 6px; font-size: 22px; font-weight: 800; color: var(--accent); }
            .doc-kv { margin-top: 10px; font-size: 12px; color: var(--muted); line-height: 1.45; }
            .qr { margin-top: 10px; width: 110px; height: 110px; }
            .grid { display:grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; margin-top: 16px; }
            .card { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: #fff; }
            .card-head { background: var(--primary); padding: 10px 12px; color: #fff; font-weight: 800; font-size: 13px; }
            .card-body { padding: 12px; font-size: 12px; }
            .kv { display:grid; grid-template-columns: 140px 1fr; gap: 6px 10px; }
            .kv .k { color: var(--muted); }
            .kv .v { color: var(--text); font-weight: 600; }
            .totals { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
            .totals-head { background: var(--primary); color: #fff; padding: 10px 12px; font-weight: 800; font-size: 13px; }
            .totals-body { padding: 12px; }
            .totals-row { display:grid; grid-template-columns: 1fr auto; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
            .totals-row:last-child { border-bottom: none; }
            .totals-row .label { color: var(--muted); font-weight: 700; }
            .totals-row .value { font-weight: 800; color: var(--text); }
            .totals-row.total .value { color: var(--primary); }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="top">
            <div>
              <div class="company-name">${companyName}</div>
              ${companyRnc ? `<div class="company-meta">RNC: ${companyRnc}</div>` : ''}
              ${companyPhone ? `<div class="company-meta">Tel: ${companyPhone}</div>` : ''}
              ${companyEmail ? `<div class="company-meta">Email: ${companyEmail}</div>` : ''}
              ${companyAddress ? `<div class="company-meta">Dirección: ${companyAddress}</div>` : ''}
            </div>
            <div class="doc">
              <div class="doc-title">ANTICIPO</div>
              <div class="doc-number">#${advance.number}</div>
              <div class="doc-kv">
                <div><strong>Fecha:</strong> ${advanceDate}</div>
                <div><strong>Estado:</strong> ${advance.status}</div>
                ${dueDate ? `<div><strong>Vencimiento:</strong> ${dueDate}</div>` : ''}
              </div>
              ${qrDataUrl ? `<img class="qr" alt="QR" src="${qrDataUrl}" />` : ''}
            </div>
          </div>

          <div class="grid">
            <div class="card">
              <div class="card-head">Proveedor</div>
              <div class="card-body">
                <div class="kv">
                  <div class="k">Nombre</div>
                  <div class="v">${supplierName}</div>
                </div>
              </div>
            </div>
            <div class="totals">
              <div class="totals-head">Resumen</div>
              <div class="totals-body">
                <div class="totals-row"><div class="label">Monto</div><div class="value">RD$ ${formatMoney(advance.amount, '')}</div></div>
                <div class="totals-row"><div class="label">Aplicado</div><div class="value">RD$ ${formatMoney(advance.appliedAmount, '')}</div></div>
                <div class="totals-row total"><div class="label">Balance</div><div class="value">RD$ ${formatMoney(advance.remainingBalance, '')}</div></div>
              </div>
            </div>
          </div>

          ${advance.reason ? `
          <div style="margin-top: 16px; padding: 12px; border: 1px solid var(--border); border-radius: 12px;">
            <div style="font-weight: 700; color: var(--muted); margin-bottom: 6px;">Motivo</div>
            <div style="font-size: 12px;">${advance.reason}</div>
          </div>
          ` : ''}

          <script>
            window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 1000); };
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleApply = async (id: string) => {
    const advance = advances.find(a => a.id === id);
    if (!advance) return;
    if (!confirm(`Apply the remaining RD$ ${advance.remainingBalance.toLocaleString()} for this advance?`)) return;
    try {
      const newApplied = advance.appliedAmount + advance.remainingBalance;
      const newBalance = 0;
      await apSupplierAdvancesService.updateStatus(id, 'applied', {
        appliedAmount: newApplied,
        balanceAmount: newBalance,
      });
      await loadAdvances();
      alert('Advance applied successfully.');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error aplicando anticipo de suplidor', error);
      alert('The advance could not be applied.');
    }
  };

  const exportToExcel = async () => {
    if (!filteredAdvances.length) {
      alert('There are no advances to export.');
      return;
    }

    let companyName = 'ContaBi';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info) {
        companyName = (info as any).name || (info as any).company_name || 'ContaBi';
      }
    } catch {
      // usar default
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Supplier Advances');

    const headers = [
      { title: 'Number', width: 18 },
      { title: 'Date', width: 14 },
      { title: 'Supplier', width: 30 },
      { title: 'Amount', width: 16 },
      { title: 'Applied', width: 16 },
      { title: 'Balance', width: 16 },
      { title: 'Reason', width: 30 },
      { title: 'Status', width: 14 },
    ];

    let currentRow = 1;
    ws.mergeCells(currentRow, 1, currentRow, headers.length);
    ws.getCell(currentRow, 1).value = companyName;
    ws.getCell(currentRow, 1).font = { bold: true, size: 14 };
    currentRow++;

    ws.mergeCells(currentRow, 1, currentRow, headers.length);
    ws.getCell(currentRow, 1).value = 'Supplier Advances';

    ws.getCell(currentRow, 1).font = { bold: true, size: 12 };
    currentRow++;

    ws.mergeCells(currentRow, 1, currentRow, headers.length);
    ws.getCell(currentRow, 1).value = `Generated: ${new Date().toLocaleDateString('en-US')}`;

    currentRow++;
    currentRow++;

    const headerRow = ws.getRow(currentRow);
    headers.forEach((h, idx) => {
      headerRow.getCell(idx + 1).value = h.title;
    });
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } } as any;
      cell.alignment = { vertical: 'middle', horizontal: 'center' } as any;
    });
    currentRow++;

    for (const adv of filteredAdvances) {
      const r = ws.getRow(currentRow);
      r.getCell(1).value = adv.number;
      r.getCell(2).value = adv.date;
      r.getCell(3).value = adv.supplierName;
      r.getCell(4).value = Number(adv.amount || 0);
      r.getCell(5).value = Number(adv.appliedAmount || 0);
      r.getCell(6).value = Number(adv.remainingBalance || 0);
      r.getCell(7).value = adv.reason;
      r.getCell(8).value = adv.status;
      currentRow++;
    }

    [4, 5, 6].forEach((col) => {
      ws.getColumn(col).numFmt = '#,##0.00';
    });
    headers.forEach((h, idx) => {
      ws.getColumn(idx + 1).width = h.width;
    });

    // Estadísticas
    currentRow++;
    const totalAmount = filteredAdvances.reduce((s, a) => s + a.amount, 0);
    const totalApplied = filteredAdvances.reduce((s, a) => s + a.appliedAmount, 0);
    const totalBalance = filteredAdvances.reduce((s, a) => s + a.remainingBalance, 0);

    ws.getCell(currentRow, 1).value = 'Summary';
    ws.getCell(currentRow, 1).font = { bold: true };
    currentRow++;
    ws.getCell(currentRow, 1).value = 'Total Advances';

    ws.getCell(currentRow, 2).value = totalAmount;
    ws.getCell(currentRow, 2).numFmt = '#,##0.00';
    currentRow++;
    ws.getCell(currentRow, 1).value = 'Total Applied';

    ws.getCell(currentRow, 2).value = totalApplied;
    ws.getCell(currentRow, 2).numFmt = '#,##0.00';
    currentRow++;
    ws.getCell(currentRow, 1).value = 'Remaining Balance';

    ws.getCell(currentRow, 2).value = totalBalance;
    ws.getCell(currentRow, 2).numFmt = '#,##0.00';

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    saveAs(blob, `supplier-advances-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <DashboardLayout>
      <div
        className="space-y-6 rounded-3xl"
        style={{ backgroundColor: palette.cream, minHeight: '100vh', padding: '24px' }}
      >
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide font-semibold" style={{ color: palette.greenSoft }}>
              Accounts Payable · Advances
            </p>
            <h1 className="text-3xl font-bold" style={{ color: palette.greenDark }}>Supplier Advances</h1>
            <p className="text-base" style={{ color: palette.greenSoft }}>
              Manage supplier prepayments, approvals, and outstanding balances.
            </p>
          </div>
          <div className="flex space-x-3">
            <button 
              onClick={exportToExcel}
              className="px-4 py-2 rounded-lg font-semibold text-white transition-colors whitespace-nowrap shadow"
              style={{ backgroundColor: palette.greenMid }}
            >
              <i className="ri-file-excel-line mr-2"></i>
              Export Excel
            </button>
            <button 
              onClick={() => setShowModal(true)}
              className="px-4 py-2 rounded-lg font-semibold text-white transition-colors whitespace-nowrap shadow"
              style={{ backgroundColor: palette.green }}
            >
              <i className="ri-add-line mr-2"></i>
              New Advance
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-[rgba(47,79,48,0.15)] p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mr-4" style={{ backgroundColor: palette.badgeNeutral }}>
                <i className="ri-money-dollar-circle-line text-xl" style={{ color: palette.greenDark }}></i>
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: palette.greenSoft }}>Total Advances</p>
                <p className="text-2xl font-bold" style={{ color: palette.greenDark }}>
                  RD$ {advances.reduce((sum, a) => sum + a.amount, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-[rgba(47,79,48,0.15)] p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mr-4" style={{ backgroundColor: '#F2E3C1' }}>
                <i className="ri-time-line text-xl" style={{ color: palette.green }}></i>
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: palette.greenSoft }}>Pending</p>
                <p className="text-2xl font-bold" style={{ color: palette.greenDark }}>
                  RD$ {advances.filter(a => a.status === 'Pending').reduce((sum, a) => sum + a.amount, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-[rgba(47,79,48,0.15)] p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mr-4" style={{ backgroundColor: '#D3E0CF' }}>
                <i className="ri-check-line text-xl" style={{ color: palette.green }}></i>
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: palette.greenSoft }}>Approved</p>
                <p className="text-2xl font-bold" style={{ color: palette.greenDark }}>
                  RD$ {advances.filter(a => a.status === 'Approved').reduce((sum, a) => sum + a.amount, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-[rgba(47,79,48,0.15)] p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mr-4" style={{ backgroundColor: '#E5D7F0' }}>
                <i className="ri-wallet-line text-xl" style={{ color: palette.greenMid }}></i>
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: palette.greenSoft }}>Outstanding Balance</p>
                <p className="text-2xl font-bold" style={{ color: palette.greenDark }}>
                  RD$ {advances.reduce((sum, a) => sum + a.remainingBalance, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-[rgba(47,79,48,0.15)] p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: palette.greenDark }}>
                Status <span className="text-red-500">*</span>
              </label>
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2"
                style={{ borderColor: palette.badgeNeutral, color: palette.greenDark }}
              >
                <option value="all">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Applied">Applied</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
            <div className="md:col-span-2 flex items-end">
              <button 
                onClick={() => setFilterStatus('all')}
                className="w-full text-white py-2 px-4 rounded-lg transition-colors whitespace-nowrap shadow"
                style={{ backgroundColor: palette.greenDark }}
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Advances Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-[rgba(47,79,48,0.15)]">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold" style={{ color: palette.greenDark }}>Advance List</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAdvances.map((advance) => (
                  <tr key={advance.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{advance.number}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{advance.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{advance.supplierName}</div>
                        <div className="text-sm text-gray-500 truncate max-w-xs">{advance.reason}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                      RD$ {advance.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                      RD$ {advance.remainingBalance.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{advance.dueDate}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        advance.status === 'Approved' ? 'bg-green-100 text-green-800' :
                        advance.status === 'Pending' ? 'bg-orange-100 text-orange-800' :
                        advance.status === 'Applied' ? 'bg-blue-100 text-blue-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {advance.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => handlePrintAdvance(advance)}
                          className="text-purple-600 hover:text-purple-900 whitespace-nowrap"
                        >
                          <i className="ri-printer-line"></i>
                        </button>
                        <button 
                          onClick={() => handleEdit(advance)}
                          className="text-indigo-600 hover:text-indigo-900 whitespace-nowrap"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        {advance.status === 'Pending' && (
                          <>
                            <button 
                              onClick={() => handleApprove(advance.id)}
                              className="text-green-600 hover:text-green-900 whitespace-nowrap"
                            >
                              <i className="ri-check-line"></i>
                            </button>
                            <button 
                              onClick={() => handleReject(advance.id)}
                              className="text-red-600 hover:text-red-900 whitespace-nowrap"
                            >
                              <i className="ri-close-line"></i>
                            </button>
                          </>
                        )}
                        {advance.status === 'Approved' && advance.remainingBalance > 0 && (
                          <button 
                            onClick={() => handleApply(advance.id)}
                            className="text-blue-600 hover:text-blue-900 whitespace-nowrap"
                          >
                            <i className="ri-wallet-line"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Advance Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingAdvance ? 'Edit Advance' : 'New Advance'}
                </h3>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Supplier *</label>
                    <select 
                      required
                      value={formData.supplierId}
                      onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select supplier</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount *</label>
                    <input 
                      type="number" min="0"
                      required
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({...formData, amount: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Transaction Date *</label>
                    <input 
                      type="date"
                      required
                      value={formData.transactionDate}
                      onChange={(e) => setFormData({...formData, transactionDate: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method *</label>
                    <select
                      value={formData.paymentMethod}
                      onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="cash">Cash</option>
                      <option value="check">Check</option>
                      <option value="transfer">Transfer</option>
                      <option value="petty_cash">Petty Cash</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Bank Account</label>
                    <select
                      value={formData.bankId}
                      onChange={(e) => setFormData({ ...formData, bankId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select bank...</option>
                      {bankAccounts.map((b: any) => (
                        <option key={b.id} value={b.id}>
                          {b.name} - {b.account_number} ({b.currency || 'DOP'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Supporting Document No.</label>
                    <input
                      type="text"
                      value={formData.documentNumber}
                      onChange={(e) => setFormData({ ...formData, documentNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Check/transfer reference"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Document Date</label>
                    <input
                      type="date"
                      value={formData.documentDate}
                      onChange={(e) => setFormData({ ...formData, documentDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Advance Account *</label>
                    <select
                      value={formData.accountId}
                      onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select account...</option>
                      {accounts.map((acc: any) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Reason *</label>
                    <textarea 
                      required
                      value={formData.reason}
                      onChange={(e) => setFormData({...formData, reason: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Describe the reason for the advance..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Due Date *</label>
                    <input 
                      type="date"
                      required
                      value={formData.dueDate}
                      onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button 
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 text-white rounded-lg whitespace-nowrap transition-colors shadow-sm"
                    style={{ backgroundColor: '#4b5c4b' }}
                  >
                    {editingAdvance ? 'Update' : 'Create'} Advance
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}