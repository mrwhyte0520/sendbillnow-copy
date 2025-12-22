import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { bankAccountsService, bankTransfersService, chartAccountsService, financialReportsService, suppliersService, apInvoicesService } from '../../services/database';

interface BankTransfer {
  id: string;
  tipo: 'interna' | 'proveedor'; // transfer_type
  bancoOrigen: string; // from_bank_id
  cuentaOrigen: string; // from_bank_account_code
  bancoDestino: string; // to_bank_id
  cuentaDestino: string; // to_bank_account_code
  proveedor?: string; // supplier_id
  proveedorNombre?: string; // supplier name
  moneda: string; // currency
  monto: number; // amount
  fecha: string; // transfer_date (ISO)
  referencia: string; // reference
  descripcion: string;
  estado: string; // status
}

interface Supplier {
  id: string;
  legal_name: string;
  tax_id: string;
}

interface PendingInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_to_pay: number;
  paid_amount: number;
  balance: number;
}

export default function BankTransfersPage() {
  const { user } = useAuth();
  const [transfers, setTransfers] = useState<BankTransfer[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<PendingInvoice[]>([]);
  const [accountsById, setAccountsById] = useState<Record<string, { id: string; code: string; name: string }>>({});
  const [originBalance, setOriginBalance] = useState<number | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<Record<string, number>>({});
  const [form, setForm] = useState({
    tipo: 'interna' as 'interna' | 'proveedor',
    bancoOrigen: '',
    cuentaOrigen: '',
    bancoDestino: '',
    cuentaDestino: '',
    proveedor: '',
    moneda: 'DOP',
    monto: '',
    fecha: new Date().toISOString().slice(0, 10),
    referencia: '',
    descripcion: '',
  });

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleOriginBankChange = (bankId: string) => {
    setForm(prev => {
      const next = { ...prev, bancoOrigen: bankId };
      const selectedBank = (banks || []).find((b: any) => b.id === bankId);
      if (selectedBank) {
        const accountId = selectedBank.chart_account_id as string | undefined;
        if (accountId) {
          const acc = accountsById[accountId];
          if (acc) {
            next.cuentaOrigen = acc.code;
          }
        }
        if (selectedBank.currency) {
          next.moneda = selectedBank.currency;
        }
      }
      return next;
    });
  };

  const handleDestBankChange = (bankId: string) => {
    setForm(prev => {
      const next = { ...prev, bancoDestino: bankId };
      const selectedBank = (banks || []).find((b: any) => b.id === bankId);
      if (selectedBank) {
        const accountId = selectedBank.chart_account_id as string | undefined;
        if (accountId) {
          const acc = accountsById[accountId];
          if (acc) {
            next.cuentaDestino = acc.code;
          }
        }
      }
      return next;
    });
  };

  useEffect(() => {
    const loadTransfers = async () => {
      if (!user?.id) return;
      const data = await bankTransfersService.getAll(user.id);
      const mapped: BankTransfer[] = (data || []).map((row: any) => ({
        id: row.id,
        tipo: row.transfer_type || 'interna',
        bancoOrigen: row.from_bank_id || '',
        cuentaOrigen: row.from_bank_account_code || '',
        bancoDestino: row.to_bank_id || '',
        cuentaDestino: row.to_bank_account_code || '',
        proveedor: row.supplier_id || '',
        proveedorNombre: row.supplier_name || '',
        moneda: row.currency || 'DOP',
        monto: Number(row.amount) || 0,
        fecha: row.transfer_date || (row.created_at ? row.created_at.slice(0, 10) : ''),
        referencia: row.reference || '',
        descripcion: row.description || '',
        estado: row.status || 'issued',
      }));
      setTransfers(mapped);
    };

    loadTransfers();
  }, [user?.id]);

  useEffect(() => {
    const loadBanksAndAccounts = async () => {
      if (!user?.id) return;
      try {
        const [bankRows, chartRows, supplierRows] = await Promise.all([
          bankAccountsService.getAll(user.id),
          chartAccountsService.getAll(user.id),
          suppliersService.getAll(user.id),
        ]);

        setBanks(bankRows || []);
        setSuppliers(supplierRows || []);

        const map: Record<string, { id: string; code: string; name: string }> = {};
        (chartRows || []).forEach((acc: any) => {
          map[acc.id] = {
            id: acc.id,
            code: acc.code,
            name: acc.name,
          };
        });
        setAccountsById(map);
      } catch (error) {
        console.error('Error cargando bancos y cuentas contables para transferencias', error);
      }
    };

    loadBanksAndAccounts();
  }, [user?.id]);

  // Cargar facturas pendientes cuando se selecciona un proveedor
  useEffect(() => {
    const loadPendingInvoices = async () => {
      if (!user?.id || !form.proveedor || form.tipo !== 'proveedor') {
        setPendingInvoices([]);
        setSelectedInvoices({});
        return;
      }
      try {
        const invs = await apInvoicesService.getAll(user.id);
        const pending = (invs || []).filter((i: any) => {
          const st = String(i.status || '').toLowerCase();
          if (i.supplier_id !== form.proveedor) return false;
          if (st === 'paid') return false;
          if (st === 'cancelled' || st === 'cancelada' || st === 'void' || st === 'anulada' || st === 'draft') return false;
          return true;
        }).map((i: any) => {
          const totalToPay = Number(i.total_to_pay) || 0;
          const paid = Number(i.paid_amount) || 0;
          // Calcular balance real como total - pagado
          const balance = Math.max(totalToPay - paid, 0);
          return {
            id: i.id,
            invoice_number: i.invoice_number,
            invoice_date: i.invoice_date,
            total_to_pay: totalToPay,
            paid_amount: paid,
            balance,
          };
        }).filter((inv: any) => inv.balance > 0.01); // Solo mostrar facturas con saldo pendiente
        setPendingInvoices(pending);
      } catch (error) {
        console.error('Error loading pending invoices for supplier', error);
        setPendingInvoices([]);
      }
    };

    loadPendingInvoices();
  }, [user?.id, form.proveedor, form.tipo]);

  // Cargar saldo contable estimado de la cuenta de banco origen
  useEffect(() => {
    const loadOriginBalance = async () => {
      if (!user?.id || !form.bancoOrigen) {
        setOriginBalance(null);
        return;
      }
      try {
        const originBank = (banks || []).find((b: any) => b.id === form.bancoOrigen);
        if (!originBank?.chart_account_id) {
          setOriginBalance(null);
          return;
        }
        const asOfDate = form.fecha || new Date().toISOString().slice(0, 10);
        const trial = await financialReportsService.getTrialBalance(user.id, '1900-01-01', asOfDate);
        const originAccount = (trial || []).find((acc: any) => acc.account_id === originBank.chart_account_id);
        if (originAccount) {
          setOriginBalance(Number(originAccount.balance) || 0);
        } else {
          setOriginBalance(null);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading origin bank balance for transfer', error);
        setOriginBalance(null);
      }
    };

    loadOriginBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, form.bancoOrigen, form.fecha, banks]);

  useEffect(() => {
    if (form.tipo !== 'proveedor') return;
    const entries = Object.entries(selectedInvoices).filter(([, v]) => (Number(v) || 0) > 0);
    if (entries.length === 0) {
      setForm(prev => ({ ...prev, monto: '' }));
      return;
    }

    if (entries.length === 1) {
      const onlyAmount = Number(entries[0][1]) || 0;
      setForm(prev => (prev.monto === '' ? { ...prev, monto: String(onlyAmount) } : prev));
      return;
    }

    const total = entries.reduce((sum, [, amount]) => sum + (Number(amount) || 0), 0);
    setForm(prev => ({ ...prev, monto: total.toFixed(2) }));
  }, [form.tipo, selectedInvoices]);

  const handleAddTransfer = async (e: React.FormEvent) => {
    e.preventDefault();

    const montoNumber = Number(form.monto);
    if (!form.bancoOrigen || !form.cuentaOrigen || !form.moneda || !form.fecha) {
      alert('Complete banco y cuenta de origen, moneda y fecha.');
      return;
    }
    if (isNaN(montoNumber) || montoNumber <= 0) {
      alert('El monto debe ser un número mayor que cero.');
      return;
    }

    // Validaciones específicas por tipo
    if (form.tipo === 'interna' && !form.bancoDestino) {
      alert('Para transferencias internas debe seleccionar un banco destino.');
      return;
    }
    if (form.tipo === 'proveedor' && !form.proveedor) {
      alert('Para pagos a proveedores debe seleccionar un proveedor.');
      return;
    }

    if (!user?.id) {
      alert('Usuario no autenticado. Inicie sesión nuevamente.');
      return;
    }

    try {
      // Advertencia de saldo insuficiente (no bloqueante)
      try {
        if (originBalance === null) {
          alert(
            'Advertencia: no se pudo estimar el saldo contable de la cuenta de banco origen. ' +
              'Verifique sus saldos bancarios reales antes de confirmar la operación en el banco.'
          );
        } else if (originBalance >= 0 && montoNumber > originBalance + 0.01) {
          alert(
            `Advertencia: el monto a transferir (${montoNumber.toLocaleString()}) excede el saldo contable estimado de la cuenta (${originBalance.toLocaleString()}). ` +
              'Verifique sus saldos bancarios reales antes de confirmar la operación en el banco.'
          );
        }
      } catch (balanceError) {
        // No interrumpir la operación por errores al estimar el saldo
        // eslint-disable-next-line no-console
        console.error('Error estimating origin bank balance for transfer', balanceError);
      }

      const created = await bankTransfersService.create(user.id, {
        transfer_type: form.tipo,
        from_bank_id: form.bancoOrigen,
        from_bank_account_code: form.cuentaOrigen,
        to_bank_id: form.tipo === 'interna' ? form.bancoDestino : null,
        to_bank_account_code: form.tipo === 'interna' ? form.cuentaDestino : null,
        supplier_id: form.tipo === 'proveedor' ? form.proveedor : null,
        currency: form.moneda,
        amount: montoNumber,
        transfer_date: form.fecha,
        reference: form.referencia.trim(),
        description: form.descripcion.trim(),
        invoice_payments: form.tipo === 'proveedor' ? (() => {
          const entries = Object.entries(selectedInvoices).filter(([, v]) => (Number(v) || 0) > 0);
          // Si hay exactamente 1 factura seleccionada, usar form.monto como amount_to_pay
          if (entries.length === 1) {
            return [{ invoice_id: entries[0][0], amount_to_pay: montoNumber }];
          }
          // Si hay múltiples, usar los montos individuales de selectedInvoices
          return entries.map(([id, amount]) => ({
            invoice_id: id,
            amount_to_pay: Number(amount) || 0
          }));
        })() : [],
      });

      const supplierName = form.tipo === 'proveedor' 
        ? suppliers.find(s => s.id === form.proveedor)?.legal_name || ''
        : '';

      const mapped: BankTransfer = {
        id: created.id,
        tipo: form.tipo,
        bancoOrigen: created.from_bank_id || form.bancoOrigen,
        cuentaOrigen: created.from_bank_account_code || form.cuentaOrigen,
        bancoDestino: created.to_bank_id || form.bancoDestino,
        cuentaDestino: created.to_bank_account_code || form.cuentaDestino,
        proveedor: created.supplier_id || form.proveedor,
        proveedorNombre: supplierName,
        moneda: created.currency || form.moneda,
        monto: Number(created.amount) || montoNumber,
        fecha: created.transfer_date || form.fecha,
        referencia: created.reference || form.referencia.trim(),
        descripcion: created.description || form.descripcion.trim(),
        estado: created.status || 'issued',
      };

      setTransfers(prev => [mapped, ...prev]);
      setSelectedInvoices({});

      if (form.tipo === 'proveedor' && form.proveedor) {
        try {
          const invs = await apInvoicesService.getAll(user.id);
          const pending = (invs || []).filter((i: any) => {
            const st = String(i.status || '').toLowerCase();
            if (i.supplier_id !== form.proveedor) return false;
            if (st === 'paid') return false;
            if (st === 'cancelled' || st === 'cancelada' || st === 'void' || st === 'anulada' || st === 'draft') return false;
            return true;
          }).map((i: any) => {
            const totalToPay = Number(i.total_to_pay) || 0;
            const paid = Number(i.paid_amount) || 0;
            // Calcular balance real como total - pagado
            const balance = Math.max(totalToPay - paid, 0);
            return {
              id: i.id,
              invoice_number: i.invoice_number,
              invoice_date: i.invoice_date,
              total_to_pay: totalToPay,
              paid_amount: paid,
              balance,
            };
          }).filter((inv: any) => inv.balance > 0.01); // Solo mostrar facturas con saldo pendiente
          setPendingInvoices(pending);
        } catch (reloadErr) {
          console.error('Error reloading pending invoices after transfer', reloadErr);
        }
      }

      setForm(prev => ({
        ...prev,
        monto: '',
        referencia: '',
        descripcion: '',
        proveedor: prev.tipo === 'proveedor' ? prev.proveedor : '',
        bancoDestino: '',
        cuentaDestino: '',
      }));
      alert('Transferencia registrada exitosamente');
    } catch (error: any) {
      console.error('Error creando transferencia bancaria:', error);
      alert(error?.message || 'Error al registrar la transferencia bancaria.');
    }
  };

  const selectedOriginBank = (banks || []).find((b: any) => b.id === form.bancoOrigen);
  const originBankAccountLabel = (() => {
    if (selectedOriginBank?.chart_account_id) {
      const acc = accountsById[selectedOriginBank.chart_account_id];
      if (acc) {
        return `${acc.code} - ${acc.name}`;
      }
    }
    return form.cuentaOrigen;
  })();

  const selectedDestBank = (banks || []).find((b: any) => b.id === form.bancoDestino);
  const destBankAccountLabel = (() => {
    if (selectedDestBank?.chart_account_id) {
      const acc = accountsById[selectedDestBank.chart_account_id];
      if (acc) {
        return `${acc.code} - ${acc.name}`;
      }
    }
    return form.cuentaDestino;
  })();

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Transferencias Bancarias</h1>
          <p className="text-gray-600 text-sm max-w-3xl">
            Registre transferencias entre cuentas bancarias o hacia otras cuentas, indicando banco y cuenta de origen,
            banco/cuenta destino (si aplica), moneda, monto, fecha, referencia y concepto.
          </p>
        </div>

        {/* Formulario de registro */}
        <form onSubmit={handleAddTransfer} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
          <h2 className="text-lg font-semibold mb-2">Registrar nueva transferencia bancaria</h2>

          {/* Selector de tipo de transferencia */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Transferencia *</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, tipo: 'interna', proveedor: '', bancoDestino: '', cuentaDestino: '' }))}
                className={`p-3 rounded-lg border-2 transition-all ${
                  form.tipo === 'interna'
                    ? 'border-blue-500 bg-blue-100 text-blue-900'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center justify-center mb-1">
                  <i className="ri-arrow-left-right-line text-2xl"></i>
                </div>
                <div className="font-semibold">Transferencia Interna</div>
                <div className="text-xs mt-1">Entre cuentas de la misma empresa</div>
              </button>
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, tipo: 'proveedor', bancoDestino: '', cuentaDestino: '' }))}
                className={`p-3 rounded-lg border-2 transition-all ${
                  form.tipo === 'proveedor'
                    ? 'border-green-500 bg-green-100 text-green-900'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-green-300'
                }`}
              >
                <div className="flex items-center justify-center mb-1">
                  <i className="ri-user-line text-2xl"></i>
                </div>
                <div className="font-semibold">Pago a Proveedor</div>
                <div className="text-xs mt-1">Transferencia a terceros</div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Banco Origen</label>
              <select
                value={form.bancoOrigen}
                onChange={(e) => handleOriginBankChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Seleccione un banco...</option>
                {banks.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.bank_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta Origen (Cuenta Contable)</label>
              <input
                type="text"
                value={originBankAccountLabel || ''}
                disabled
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-700"
                placeholder="Se asigna automáticamente según el banco de origen seleccionado"
              />
            </div>

            {/* Campos para transferencia interna */}
            {form.tipo === 'interna' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Banco Destino *</label>
                  <select
                    value={form.bancoDestino}
                    onChange={(e) => handleDestBankChange(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Seleccione banco destino...</option>
                    {banks.filter(b => b.id !== form.bancoOrigen).map((b: any) => (
                      <option key={b.id} value={b.id}>{b.bank_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta Destino (Cuenta Contable)</label>
                  <input
                    type="text"
                    value={destBankAccountLabel || ''}
                    disabled
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-700"
                    placeholder="Se asigna automáticamente según el banco destino"
                  />
                </div>
              </>
            )}

            {/* Campos para pago a proveedor */}
            {form.tipo === 'proveedor' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor *</label>
                <select
                  value={form.proveedor}
                  onChange={(e) => handleChange('proveedor', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Seleccione un proveedor...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.legal_name} - {s.tax_id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
              <input
                type="text"
                value={form.moneda}
                disabled
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-700"
              />
            </div>

            {form.tipo === 'interna' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
                <input
                  type="number" min="0"
                  step="0.01"
                  value={form.monto}
                  onChange={(e) => handleChange('monto', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de la Transferencia</label>
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => handleChange('fecha', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Referencia</label>
              <input
                type="text"
                value={form.referencia}
                onChange={(e) => handleChange('referencia', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: TRF-0001"
              />
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción / Concepto</label>
              <input
                type="text"
                value={form.descripcion}
                onChange={(e) => handleChange('descripcion', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={form.tipo === 'interna' ? 'Ej: Transferencia entre cuentas' : 'Ej: Pago factura #123'}
              />
            </div>
          </div>

          {/* Facturas pendientes para pago a proveedor */}
          {form.tipo === 'proveedor' && form.proveedor && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Facturas Pendientes del Proveedor
              </h3>
              <p className="text-xs text-gray-600 mb-3">
                Puede asignar el pago a facturas específicas. Si no selecciona ninguna, se registrará como pago general.
              </p>

              {pendingInvoices.length === 0 ? (
                <div className="text-xs text-gray-700">
                  No hay facturas pendientes para este proveedor.
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={
                          pendingInvoices.length > 0 &&
                          pendingInvoices
                            .filter(inv => (Number(inv.balance) || 0) > 0)
                            .every(inv => (Number((selectedInvoices as any)[inv.id]) || 0) > 0)
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            const next: Record<string, number> = {};
                            pendingInvoices.forEach(inv => {
                              const bal = Number(inv.balance) || 0;
                              if (bal > 0) next[inv.id] = bal;
                            });
                            setSelectedInvoices(next);
                          } else {
                            setSelectedInvoices({});
                          }
                        }}
                        className="mr-2"
                      />
                      Seleccionar todas
                    </label>
                    <div className="text-xs text-gray-600">
                      Total asignado: {form.moneda} {Object.values(selectedInvoices).reduce((sum, val) => sum + val, 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {pendingInvoices.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between bg-white p-2 rounded border border-gray-200">
                        <div className="pr-2">
                          <input
                            type="checkbox"
                            checked={(Number((selectedInvoices as any)[inv.id]) || 0) > 0}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSelectedInvoices(prev => {
                                if (!checked) {
                                  const { [inv.id]: _, ...rest } = prev;
                                  return rest;
                                }
                                const bal = Number(inv.balance) || 0;
                                if (bal <= 0) return prev;
                                return { ...prev, [inv.id]: bal };
                              });
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">{inv.invoice_number}</div>
                          <div className="text-xs text-gray-500">
                            Fecha: {inv.invoice_date} | Saldo: {form.moneda} {inv.balance.toLocaleString()}
                          </div>
                        </div>
                        <input
                          type="number"
                          min="0"
                          max={inv.balance}
                          step="0.01"
                          value={(Number((selectedInvoices as any)[inv.id]) || 0) > 0 ? ((selectedInvoices as any)[inv.id] ?? '') : ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setSelectedInvoices(prev => {
                              if (val <= 0) {
                                const { [inv.id]: _, ...rest } = prev;
                                return rest;
                              }
                              return { ...prev, [inv.id]: Math.min(val, inv.balance) };
                            });
                          }}
                          placeholder="Monto"
                          className={`w-32 border border-gray-300 rounded px-2 py-1 text-sm ${(Number((selectedInvoices as any)[inv.id]) || 0) > 0 ? '' : 'bg-gray-50 text-gray-700'}`}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {form.tipo === 'proveedor' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
                <input
                  type="number" min="0"
                  step="0.01"
                  value={form.monto}
                  disabled={Object.entries(selectedInvoices).filter(([, v]) => (Number(v) || 0) > 0).length > 1}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    handleChange('monto', nextValue);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Registrar transferencia
            </button>
          </div>
        </form>

        {/* Listado de transferencias */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Transferencias registradas</h2>
            <span className="text-xs text-gray-500">Total: {transfers.length}</span>
          </div>
          {transfers.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">
              No hay transferencias bancarias registradas aún.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Tipo</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Fecha</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Banco Origen</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Destino</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Monto</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Estado</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Referencia</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {transfers.map(tr => {
                    const statusLabel =
                      tr.estado === 'issued'
                        ? 'Emitida'
                        : tr.estado === 'processed'
                        ? 'Procesada'
                        : tr.estado === 'void'
                        ? 'Anulada'
                        : tr.estado;
                    const tipoBadge = tr.tipo === 'interna' 
                      ? <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Interna</span>
                      : <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Proveedor</span>;
                    
                    const destino = tr.tipo === 'interna'
                      ? (tr.bancoDestino || '-')
                      : (tr.proveedorNombre || tr.proveedor || '-');

                    return (
                      <tr key={tr.id}>
                        <td className="px-4 py-2 whitespace-nowrap">{tipoBadge}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{tr.fecha}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{tr.bancoOrigen}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{destino}</td>
                        <td className="px-4 py-2 text-right text-gray-900">
                          {tr.moneda} {tr.monto.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{statusLabel}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{tr.referencia || '-'}</td>
                        <td className="px-4 py-2 text-gray-900">{tr.descripcion}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
