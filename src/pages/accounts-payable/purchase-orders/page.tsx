import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import * as ExcelJS from 'exceljs';
import * as QRCode from 'qrcode';
import { saveAs } from 'file-saver';
import { useAuth } from '../../../hooks/useAuth';
import { purchaseOrdersService, purchaseOrderItemsService, suppliersService, inventoryService, chartAccountsService, settingsService } from '../../../services/database';
import { formatMoney } from '../../../utils/numberFormat';
import { useNavigate } from 'react-router-dom';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export default function PurchaseOrdersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');

  const handleCreateSupplierInvoice = (order: any) => {
    const orderId = String(order?.id || '');
    if (!orderId) return;
    navigate('/accounts-payable/invoices', {
      state: {
        prefillPurchaseOrderId: orderId,
        prefillPurchaseOrderLines: Array.isArray(order?.products)
          ? order.products.map((p: any) => ({
              inventoryItemId: p.itemId ? String(p.itemId) : '',
              description: String(p.name || ''),
              quantity: String(p.quantity ?? ''),
              unitPrice: String(p.price ?? ''),
              purchaseOrderItemId: p.purchaseOrderItemId ? String(p.purchaseOrderItemId) : undefined,
            }))
          : [],
      },
    });
  };

  const [orders, setOrders] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);

  const [formData, setFormData] = useState({
    supplierId: '',
    startDate: '',
    deliveryDate: '',
    notes: '',
    products: [{ itemId: null as string | null, name: '', quantity: 1, price: 0 }],
    inventoryAccountId: '' as string | '',
  });

  const mapDbStatusToUi = (status: string | null | undefined): string => {
    switch (status) {
      case 'draft':
      case 'sent':
        return 'Pendiente';
      case 'approved':
        return 'Aprobada';
      case 'received':
        return 'Recibida';
      case 'cancelled':
        return 'Cancelada';
      default:
        return 'Pendiente';
    }
  };

  const loadAccounts = async () => {
    if (!user?.id) {
      setAccounts([]);
      return;
    }
    try {
      const data = await chartAccountsService.getAll(user.id);
      const options = (data || [])
        .filter((acc: any) => acc.allow_posting !== false && acc.type === 'asset')
        .map((acc: any) => ({ id: acc.id, code: acc.code, name: acc.name }));
      setAccounts(options);
    } catch {
      setAccounts([]);
    }
  };

  const loadInventoryItems = async () => {
    if (!user?.id) {
      setInventoryItems([]);
      return;
    }
    try {
      const data = await inventoryService.getItems(user.id);
      setInventoryItems(data || []);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading inventory items for purchase orders', error);
      setInventoryItems([]);
    }
  };

  const mapUiStatusToDb = (status: string): string => {
    switch (status) {
      case 'Pendiente':
        return 'draft';
      case 'Aprobada':
        return 'approved';
      case 'Recibida':
        return 'received';
      case 'Cancelada':
        return 'cancelled';
      default:
        return 'pending';
    }
  };

  const loadSuppliers = async () => {
    if (!user?.id) {
      setSuppliers([]);
      return;
    }
    try {
      const rows = await suppliersService.getAll(user.id);
      const mapped = (rows || []).map((s: any) => ({
        id: s.id,
        name: s.name || 'Proveedor',
        taxId: s.tax_id || '',
        legalName: s.legal_name || s.name || '',
        phone: s.phone || s.contact_phone || '',
        email: s.email || s.contact_email || '',
        address: s.address || '',
      }));
      setSuppliers(mapped);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading suppliers for purchase orders', error);
      setSuppliers([]);
    }
  };

  const loadOrders = async () => {
    if (!user?.id) {
      setOrders([]);
      return;
    }
    try {
      const [orderRows, itemRows] = await Promise.all([
        purchaseOrdersService.getAll(user.id),
        purchaseOrderItemsService.getAllWithInvoicedByUser(user.id),
      ]);

      const itemsByOrder: Record<string, any[]> = {};
      (itemRows || []).forEach((it: any) => {
        const key = String(it.purchase_order_id);

        if (!itemsByOrder[key]) itemsByOrder[key] = [];
        itemsByOrder[key].push(it);
      });

      const mapped = (orderRows || []).map((po: any) => {
        const orderItems = itemsByOrder[String(po.id)] || [];

        let orderedQtyTotal = 0;
        let invoicedQtyTotal = 0;

        orderItems.forEach((it: any) => {
          const ordered = Number(it.quantity) || 0;
          const invoiced = Number(it.quantity_invoiced || 0);
          orderedQtyTotal += ordered;
          invoicedQtyTotal += invoiced;
        });

        const remainingQtyTotal = Math.max(orderedQtyTotal - invoicedQtyTotal, 0);
        const invoicedPct = orderedQtyTotal > 0 ? (invoicedQtyTotal / orderedQtyTotal) * 100 : 0;

        return {
          id: po.id,
          number: po.po_number,
          date: po.order_date,
          supplier: (po.suppliers as any)?.name || 'Proveedor',
          supplierId: po.supplier_id,
          products: orderItems.map((it: any) => ({
            purchaseOrderItemId: it.id ? String(it.id) : undefined,
            itemId: it.inventory_item_id as string | null,
            name: it.description as string,
            quantity: Number(it.quantity) || 0,
            price: Number(it.unit_cost) || 0,
          })),
          subtotal: Number(po.subtotal) || 0,
          itbis: Number(po.tax_amount) || 0,
          total: Number(po.total_amount) || 0,
          deliveryDate: po.expected_date,
          status: mapDbStatusToUi(po.status),
          notes: po.notes || '',
          inventoryAccountId: po.inventory_account_id || '',
          orderedQtyTotal,
          invoicedQtyTotal,
          remainingQtyTotal,
          invoicedPct,
        };
      });
      setOrders(mapped);

    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading purchase orders', error);
      setOrders([]);
    }
  };

  useEffect(() => {
    loadSuppliers();
    loadOrders();
    loadInventoryItems();
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const loadCompany = async () => {
      try {
        const info = await settingsService.getCompanyInfo();
        setCompanyInfo(info);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading company info for purchase orders', error);
      }
    };

    loadCompany();
  }, [user?.id]);

  const filteredOrders = orders.filter(order => {
    const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
    const matchesSupplier = filterSupplier === 'all' || order.supplier === filterSupplier;
    return matchesStatus && matchesSupplier;
  });

  const selectedSupplier = suppliers.find((s: any) => String(s.id) === String(formData.supplierId));

  const calculateSubtotal = () => {
    return formData.products.reduce((sum, product) => sum + (product.quantity * product.price), 0);
  };

  const calculateItbis = () => {
    return calculateSubtotal() * 0.18;
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateItbis();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      alert('Debes iniciar sesión para registrar órdenes de compra');
      return;
    }

    if (!formData.supplierId) {
      alert('Debes seleccionar un proveedor');
      return;
    }
    
    const subtotal = calculateSubtotal();
    const itbis = calculateItbis();
    const total = calculateTotal();

    const today = new Date().toISOString().split('T')[0];
    const delivery = formData.deliveryDate || today;
    const orderDate = formData.startDate || editingOrder?.date || today;
    const poNumber = editingOrder?.number
      ? editingOrder.number
      : `PO-${new Date().getFullYear()}-${String(orders.length + 1).padStart(3, '0')}`;

    const payload = {
      supplier_id: formData.supplierId,
      po_number: poNumber,
      // Para no violar el constraint esperado (expected_date >= order_date),
      // usamos como fecha de entrega al menos la misma fecha de la orden.
      order_date: orderDate,
      expected_date: delivery < orderDate ? orderDate : delivery,
      subtotal,
      tax_amount: itbis,
      total_amount: total,
      status: mapUiStatusToDb(editingOrder?.status || 'Pendiente'),
      notes: formData.notes,
      inventory_account_id: formData.inventoryAccountId || null,
    };

    try {
      let orderId: string;
      if (editingOrder?.id) {
        const updated = await purchaseOrdersService.update(editingOrder.id as string, payload);
        orderId = String(updated.id);
        await purchaseOrderItemsService.deleteByOrder(orderId);
      } else {
        const created = await purchaseOrdersService.create(user.id as string, payload);
        orderId = String(created.id);
      }

      await purchaseOrderItemsService.createMany(user.id as string, orderId, formData.products);
      await loadOrders();
      resetForm();
      alert(editingOrder ? 'Orden de compra actualizada exitosamente' : 'Orden de compra creada exitosamente');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error saving purchase order', error);
      alert('Error al guardar la orden de compra');
    }
  };

  const resetForm = () => {
    setFormData({
      supplierId: '',
      startDate: '',
      deliveryDate: '',
      notes: '',
      products: [{ itemId: null, name: '', quantity: 1, price: 0 }],
      inventoryAccountId: '',
    });
    setEditingOrder(null);
    setShowModal(false);
  };

  const handleEdit = (order: any) => {
    setEditingOrder(order);
    setFormData({
      supplierId: order.supplierId || '',
      startDate: order.date || '',
      deliveryDate: order.deliveryDate,
      notes: order.notes,
      products: order.products,
      inventoryAccountId: order.inventoryAccountId || '',
    });
    setShowModal(true);
  };

  const handleApprove = async (id: string | number) => {
    if (!confirm('¿Aprobar esta orden de compra?')) return;
    try {
      await purchaseOrdersService.updateStatus(String(id), mapUiStatusToDb('Aprobada'));
      await loadOrders();
      alert('Orden de compra aprobada exitosamente');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error approving purchase order', error);
      alert('No se pudo aprobar la orden');
    }
  };

  const handleCancel = async (id: string | number) => {
    if (!confirm('¿Cancelar esta orden de compra?')) return;
    try {
      await purchaseOrdersService.updateStatus(String(id), mapUiStatusToDb('Cancelada'));
      await loadOrders();
      alert('Orden de compra cancelada');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error cancelling purchase order', error);
      alert('No se pudo cancelar la orden');
    }
  };

  const addProduct = () => {
    setFormData({
      ...formData,
      products: [...formData.products, { itemId: null, name: '', quantity: 1, price: 0 }]
    });
  };

  const removeProduct = (index: number) => {
    if (formData.products.length > 1) {
      setFormData({
        ...formData,
        products: formData.products.filter((_, i) => i !== index)
      });
    }
  };

  const updateProduct = (index: number, field: string, value: any) => {
    setFormData(prev => {
      const updatedProducts = prev.products.map((product, i) =>
        i === index ? { ...product, [field]: value } : product
      );
      return {
        ...prev,
        products: updatedProducts,
      };
    });
  };

  const exportToPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text('Órdenes de Compra', 20, 20);

    doc.setFontSize(12);
    doc.text(`Fecha de Generación: ${new Date().toLocaleDateString('es-DO')}`, 20, 40);
    doc.text(`Total de Órdenes: ${filteredOrders.length}`, 20, 50);

    const tableData = filteredOrders.map((order) => [
      order.number,
      order.date,
      order.supplier,
      `${formatMoney(order.total, 'RD$')}`,
      order.deliveryDate,
      order.status,
    ]);

    (doc as any).autoTable({
      head: [['Número', 'Fecha', 'Proveedor', 'Total', 'Entrega', 'Estado']],
      body: tableData,
      startY: 70,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 10 },
      columnStyles: {
        3: { halign: 'right' },
        5: { halign: 'center' },
      },
    });

    const totalAmount = filteredOrders.reduce((sum, order) => sum + order.total, 0);
    const pendingOrders = filteredOrders.filter((o) => o.status === 'Pendiente').length;
    const approvedOrders = filteredOrders.filter((o) => o.status === 'Aprobada').length;

    (doc as any).autoTable({
      body: [
        ['Total en Órdenes:', `${formatMoney(totalAmount, 'RD$')}`],
        ['Órdenes Pendientes:', `${pendingOrders}`],
        ['Órdenes Aprobadas:', `${approvedOrders}`],
      ],
      startY: (((doc as any).lastAutoTable?.finalY) ?? 70) + 20,
      theme: 'plain',
      styles: { fontStyle: 'bold' },
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i += 1) {
      doc.setPage(i);
      doc.setFontSize(10);
      doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - 50, doc.internal.pageSize.height - 10);
      doc.text('Sistema Contable - Órdenes de Compra', 20, doc.internal.pageSize.height - 10);
    }

    doc.save(`ordenes-compra-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = async () => {
    if (!filteredOrders.length) {
      alert('No hay órdenes para exportar con los filtros actuales.');
      return;
    }

    const headerCompanyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';

    const headerCompanyRnc =
      (companyInfo as any)?.rnc ||
      (companyInfo as any)?.tax_id ||
      (companyInfo as any)?.ruc ||
      '';

    const workbook = new ExcelJS.Workbook();

    const applyHeaderStyle = (row: ExcelJS.Row) => {
      row.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } } as any;
        cell.alignment = { vertical: 'middle', horizontal: 'center' } as any;
      });
    };

    // Hoja 1: Órdenes
    const wsOrders = workbook.addWorksheet('Órdenes');
    const ordersHeaders = [
      { title: 'Número', width: 16 },
      { title: 'Fecha', width: 14 },
      { title: 'Proveedor', width: 32 },
      { title: 'Subtotal', width: 16 },
      { title: 'ITBIS', width: 16 },
      { title: 'Total', width: 16 },
      { title: 'Fecha Entrega', width: 16 },
      { title: 'Estado', width: 14 },
      { title: 'Notas', width: 40 },
    ];

    let currentRow = 1;
    const totalColumnsOrders = ordersHeaders.length;

    wsOrders.mergeCells(currentRow, 1, currentRow, totalColumnsOrders);
    wsOrders.getCell(currentRow, 1).value = headerCompanyName;
    wsOrders.getCell(currentRow, 1).font = { bold: true, size: 14 };
    wsOrders.getCell(currentRow, 1).alignment = { horizontal: 'left', vertical: 'middle' } as any;
    currentRow++;

    if (headerCompanyRnc) {
      wsOrders.mergeCells(currentRow, 1, currentRow, totalColumnsOrders);
      wsOrders.getCell(currentRow, 1).value = `RNC: ${headerCompanyRnc}`;
      wsOrders.getCell(currentRow, 1).font = { bold: true };
      wsOrders.getCell(currentRow, 1).alignment = { horizontal: 'left', vertical: 'middle' } as any;
      currentRow++;
    }

    wsOrders.mergeCells(currentRow, 1, currentRow, totalColumnsOrders);
    wsOrders.getCell(currentRow, 1).value = 'Órdenes de Compra';
    wsOrders.getCell(currentRow, 1).font = { bold: true, size: 16 };
    wsOrders.getCell(currentRow, 1).alignment = { horizontal: 'left', vertical: 'middle' } as any;
    currentRow++;

    wsOrders.mergeCells(currentRow, 1, currentRow, totalColumnsOrders);
    wsOrders.getCell(currentRow, 1).value = `Generado: ${new Date().toLocaleDateString('es-DO')}`;
    wsOrders.getCell(currentRow, 1).alignment = { horizontal: 'left', vertical: 'middle' } as any;
    currentRow++;
    currentRow++;

    const headerRowOrders = wsOrders.getRow(currentRow);
    ordersHeaders.forEach((h, idx) => {
      headerRowOrders.getCell(idx + 1).value = h.title;
    });
    applyHeaderStyle(headerRowOrders);
    currentRow++;

    for (const order of filteredOrders) {
      const r = wsOrders.getRow(currentRow);
      r.getCell(1).value = order.number;
      r.getCell(2).value = order.date;
      r.getCell(3).value = order.supplier;
      r.getCell(4).value = Number(order.subtotal || 0);
      r.getCell(5).value = Number(order.itbis || 0);
      r.getCell(6).value = Number(order.total || 0);
      r.getCell(7).value = order.deliveryDate;
      r.getCell(8).value = order.status;
      r.getCell(9).value = order.notes;
      currentRow++;
    }

    // Formatos
    [4, 5, 6].forEach((col) => {
      const c = wsOrders.getColumn(col);
      c.numFmt = '#,##0.00';
      c.alignment = { horizontal: 'right' } as any;
    });

    ordersHeaders.forEach((h, idx) => {
      wsOrders.getColumn(idx + 1).width = h.width;
    });

    // Estadísticas
    currentRow++;
    const totalAmount = filteredOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const pendingOrders = filteredOrders.filter((o) => o.status === 'Pendiente').length;
    const approvedOrders = filteredOrders.filter((o) => o.status === 'Aprobada').length;

    wsOrders.getCell(currentRow, 1).value = 'Estadísticas';
    wsOrders.getCell(currentRow, 1).font = { bold: true };
    currentRow++;
    wsOrders.getCell(currentRow, 1).value = 'Total en Órdenes';
    wsOrders.getCell(currentRow, 2).value = totalAmount;
    wsOrders.getCell(currentRow, 2).numFmt = '#,##0.00';
    currentRow++;
    wsOrders.getCell(currentRow, 1).value = 'Órdenes Pendientes';
    wsOrders.getCell(currentRow, 2).value = pendingOrders;
    currentRow++;
    wsOrders.getCell(currentRow, 1).value = 'Órdenes Aprobadas';
    wsOrders.getCell(currentRow, 2).value = approvedOrders;
    currentRow++;
    wsOrders.getCell(currentRow, 1).value = 'Total Órdenes';
    wsOrders.getCell(currentRow, 2).value = filteredOrders.length;

    // Hoja 2: Detalle de Productos
    const wsProducts = workbook.addWorksheet('Detalle Productos');
    const prodHeaders = [
      { title: 'Orden', width: 16 },
      { title: 'Producto', width: 40 },
      { title: 'Cantidad', width: 12 },
      { title: 'Precio Unitario', width: 16 },
      { title: 'Total', width: 16 },
    ];

    const headerRowProducts = wsProducts.getRow(1);
    prodHeaders.forEach((h, idx) => {
      headerRowProducts.getCell(idx + 1).value = h.title;
    });
    applyHeaderStyle(headerRowProducts);

    let prodRow = 2;
    for (const order of filteredOrders) {
      for (const product of order.products || []) {
        const quantity = Number(product.quantity || 0);
        const price = Number(product.price || 0);
        const lineTotal = quantity * price;

        const r = wsProducts.getRow(prodRow);
        r.getCell(1).value = order.number;
        r.getCell(2).value = product.name;
        r.getCell(3).value = quantity;
        r.getCell(4).value = price;
        r.getCell(5).value = lineTotal;
        prodRow++;
      }
    }

    wsProducts.getColumn(4).numFmt = '#,##0.00';
    wsProducts.getColumn(5).numFmt = '#,##0.00';
    prodHeaders.forEach((h, idx) => {
      wsProducts.getColumn(idx + 1).width = h.width;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    saveAs(blob, `ordenes-compra-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const printOrder = async (order: any) => {
    const companyName = (companyInfo as any)?.name || (companyInfo as any)?.company_name || 'ContaBi';
    const companyRnc = (companyInfo as any)?.rnc || (companyInfo as any)?.tax_id || (companyInfo as any)?.ruc || '';
    const companyPhone = (companyInfo as any)?.phone || '';
    const companyEmail = (companyInfo as any)?.email || '';
    const companyAddress = (companyInfo as any)?.address || '';

    const supplier = suppliers.find((s: any) => String(s.id) === String(order.supplierId));
    const supplierName = supplier?.legalName || supplier?.name || order.supplier;
    const supplierTaxId = supplier?.taxId || '';
    const supplierPhone = supplier?.phone || '';
    const supplierEmail = supplier?.email || '';
    const supplierAddress = supplier?.address || '';

    const safeNumber = order.number || order.id;

    let qrDataUrl = '';
    try {
      const qrUrl = `${window.location.origin}/document/purchase-order/${encodeURIComponent(String(order.id || safeNumber))}`;
      qrDataUrl = await QRCode.toDataURL(qrUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 160,
      });
    } catch {
      qrDataUrl = '';
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('No se pudo abrir la ventana de impresión.');
      return;
    }

    const rowsHtml = (order.products || [])
      .map((product: any, idx: number) => {
        const qty = Number(product.quantity || 0);
        const price = Number(product.price || 0);
        const lineTotal = qty * price;
        return `
              <tr>
                <td style="width: 54px;">${idx + 1}</td>
                <td>${product.name || ''}</td>
                <td class="num" style="width: 110px;">RD$ ${Number(price || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="num" style="width: 80px;">${qty.toLocaleString('es-DO')}</td>
                <td class="num" style="width: 120px;">RD$ ${Number(lineTotal || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>`;
      })
      .join('');

    const html = `
      <html>
        <head>
          <title>Orden de Compra ${safeNumber}</title>
          <style>
            :root {
              --primary: #0b2a6f;
              --accent: #19a34a;
              --text: #111827;
              --muted: #6b7280;
              --border: #e5e7eb;
              --bg: #ffffff;
              --soft: #f3f4f6;
            }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 28px; color: var(--text); background: var(--bg); }
            .page { width: 100%; }
            .top { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; align-items: start; }
            .company { display: grid; grid-template-columns: 1fr; gap: 6px; }
            .company-name { font-weight: 800; font-size: 18px; letter-spacing: 0.2px; color: var(--primary); }
            .company-meta { font-size: 12px; color: var(--muted); line-height: 1.35; }
            .doc { text-align: right; }
            .doc-title { font-size: 44px; font-weight: 800; color: #9ca3af; letter-spacing: 1px; line-height: 1; }
            .doc-number { margin-top: 6px; font-size: 22px; font-weight: 800; color: var(--accent); }
            .doc-kv { margin-top: 10px; font-size: 12px; color: var(--muted); line-height: 1.45; }
            .qr { margin-top: 10px; width: 110px; height: 110px; }
            .section-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; margin-top: 16px; }
            .card { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: #fff; }
            .card-head { background: var(--primary); padding: 10px 12px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
            .card-head-title { font-weight: 800; font-size: 14px; color: #fff; }
            .badge { background: #fff; color: var(--primary); padding: 6px 10px; border-radius: 10px; font-weight: 800; font-size: 12px; }
            .card-body { padding: 12px; }
            .kv { display: grid; grid-template-columns: 140px 1fr; gap: 6px 10px; font-size: 12px; }
            .kv .k { color: var(--muted); }
            .kv .v { color: var(--text); font-weight: 600; }
            .table-wrap { margin-top: 18px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
            table { width: 100%; border-collapse: collapse; }
            thead th { background: var(--primary); color: #fff; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; padding: 10px; text-align: left; }
            tbody td { border-bottom: 1px solid var(--border); padding: 10px; font-size: 12px; vertical-align: top; }
            tbody tr:last-child td { border-bottom: none; }
            .num { text-align: right; font-variant-numeric: tabular-nums; }
            .totals { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
            .totals-head { background: var(--primary); color: #fff; padding: 10px 12px; font-weight: 800; font-size: 13px; }
            .totals-body { padding: 12px; }
            .totals-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
            .totals-row:last-child { border-bottom: none; }
            .totals-row .label { color: var(--muted); font-weight: 700; }
            .totals-row .value { font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; }
            .totals-row.total .label, .totals-row.total .value { font-size: 14px; }
            .totals-row.total .value { color: var(--primary); }
            .footer-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; margin-top: 16px; }
            .notes { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
            .notes-head { background: var(--primary); color: #fff; padding: 10px 12px; font-weight: 800; font-size: 13px; }
            .notes-body { padding: 12px; color: var(--muted); font-size: 12px; line-height: 1.45; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="top">
              <div class="company">
                <div class="company-name">${companyName}</div>
                ${companyRnc ? `<div class="company-meta">RNC: ${companyRnc}</div>` : ''}
                ${companyPhone ? `<div class="company-meta">Tel: ${companyPhone}</div>` : ''}
                ${companyEmail ? `<div class="company-meta">Email: ${companyEmail}</div>` : ''}
                ${companyAddress ? `<div class="company-meta">Dirección: ${companyAddress}</div>` : ''}
              </div>
              <div class="doc">
                <div class="doc-title">ORDEN</div>
                <div class="doc-number">#${safeNumber}</div>
                <div class="doc-kv">
                  <div><strong>Fecha:</strong> ${order.date ? new Date(order.date).toLocaleDateString('es-DO') : ''}</div>
                  ${order.deliveryDate ? `<div><strong>Entrega:</strong> ${new Date(order.deliveryDate).toLocaleDateString('es-DO')}</div>` : ''}
                  ${order.status ? `<div><strong>Estado:</strong> ${order.status}</div>` : ''}
                </div>
                ${qrDataUrl ? `<img class="qr" alt="QR" src="${qrDataUrl}" />` : ''}
              </div>
            </div>

            <div class="section-grid">
              <div class="card">
                <div class="card-head">
                  <div class="card-head-title">Suplidor</div>
                </div>
                <div class="card-body">
                  <div class="kv">
                    <div class="k">Nombre</div>
                    <div class="v">${supplierName}</div>
                    ${supplierTaxId ? `<div class="k">RNC / Tax ID</div><div class="v">${supplierTaxId}</div>` : ''}
                    ${supplierPhone ? `<div class="k">Teléfono</div><div class="v">${supplierPhone}</div>` : ''}
                    ${supplierEmail ? `<div class="k">Email</div><div class="v">${supplierEmail}</div>` : ''}
                    ${supplierAddress ? `<div class="k">Dirección</div><div class="v">${supplierAddress}</div>` : ''}
                  </div>
                </div>
              </div>

              <div class="totals">
                <div class="totals-head">Resumen</div>
                <div class="totals-body">
                  <div class="totals-row"><div class="label">Subtotal</div><div class="value">RD$ ${Number(order.subtotal || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
                  <div class="totals-row"><div class="label">ITBIS</div><div class="value">RD$ ${Number(order.itbis || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
                  <div class="totals-row total"><div class="label">Total</div><div class="value">RD$ ${Number(order.total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
                </div>
              </div>
            </div>

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style="width: 54px;">No.</th>
                    <th>Producto</th>
                    <th class="num" style="width: 110px;">Precio</th>
                    <th class="num" style="width: 80px;">Cant.</th>
                    <th class="num" style="width: 120px;">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>

            <div class="footer-grid">
              <div class="notes">
                <div class="notes-head">Notas</div>
                <div class="notes-body">${order.notes ? order.notes : 'Gracias por su compra.'}</div>
              </div>
              <div></div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 1000);
            };
          <\/script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleExportOrderExcel = async (order: any) => {
    const companyName = (companyInfo as any)?.name || (companyInfo as any)?.company_name || 'ContaBi';
    const companyRnc = (companyInfo as any)?.rnc || (companyInfo as any)?.tax_id || (companyInfo as any)?.ruc || '';

    const supplier = suppliers.find((s: any) => String(s.id) === String(order.supplierId));
    const supplierName = supplier?.legalName || supplier?.name || order.supplier;
    const supplierTaxId = supplier?.taxId || '';
    const supplierPhone = supplier?.phone || '';
    const supplierEmail = supplier?.email || '';
    const supplierAddress = supplier?.address || '';

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Orden');

    worksheet.mergeCells('A1:D1');
    worksheet.getCell('A1').value = companyName;
    worksheet.getCell('A1').font = { bold: true, size: 16 };
    worksheet.getCell('A1').alignment = { horizontal: 'center' } as any;

    if (companyRnc) {
      worksheet.mergeCells('A2:D2');
      worksheet.getCell('A2').value = `RNC: ${companyRnc}`;
      worksheet.getCell('A2').alignment = { horizontal: 'center' } as any;
      worksheet.getCell('A2').font = { size: 10 };
    }

    const headerStartRow = companyRnc ? 3 : 2;
    worksheet.mergeCells(`A${headerStartRow}:D${headerStartRow}`);
    worksheet.getCell(`A${headerStartRow}`).value = `Orden de Compra #${order.number}`;
    worksheet.getCell(`A${headerStartRow}`).font = { bold: true, size: 12 };

    worksheet.addRow([]);

    worksheet.addRow(['Proveedor', supplierName]);
    if (supplierTaxId) worksheet.addRow(['RNC', supplierTaxId]);
    if (supplierPhone) worksheet.addRow(['Teléfono', supplierPhone]);
    if (supplierEmail) worksheet.addRow(['Correo', supplierEmail]);
    if (supplierAddress) worksheet.addRow(['Dirección', supplierAddress]);
    worksheet.addRow(['Fecha', order.date]);

    worksheet.addRow(['Entrega', order.deliveryDate || '']);
    worksheet.addRow(['Estado', order.status]);
    if (order.notes) {
      worksheet.addRow(['Notas', order.notes]);
    }

    worksheet.addRow([]);

    const headerRow = worksheet.addRow(['Producto', 'Cantidad', 'Precio', 'Total']);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } } as any;
      cell.alignment = { vertical: 'middle', horizontal: 'center' } as any;
    });

    (order.products || []).forEach((product: any) => {
      const qty = Number(product.quantity) || 0;
      const price = Number(product.price) || 0;
      const lineTotal = qty * price;
      worksheet.addRow([
        product.name || '',
        qty,
        formatMoney(price, 'RD$'),
        formatMoney(lineTotal, 'RD$'),
      ]);
    });

    worksheet.addRow([]);
    worksheet.addRow(['', '', 'Subtotal', formatMoney(order.subtotal, 'RD$')]);
    worksheet.addRow(['', '', 'ITBIS', formatMoney(order.itbis, 'RD$')]);
    worksheet.addRow(['', '', 'Total', formatMoney(order.total, 'RD$')]);

    worksheet.columns = [
      { width: 40 },
      { width: 12 },
      { width: 14 },
      { width: 14 },
    ];

    ['C', 'D'].forEach((col) => {
      worksheet.getColumn(col).numFmt = '#,##0.00';
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const safeNumber = order.number || order.id;
    saveAs(blob, `orden_compra_${safeNumber}.xlsx`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Órdenes de Compra</h1>
            <p className="text-gray-600">Gestiona órdenes de compra y seguimiento</p>
          </div>
          <div className="flex space-x-3">
            <button 
              onClick={exportToPDF}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-pdf-line mr-2"></i>
              Exportar PDF
            </button>
            <button 
              onClick={exportToExcel}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-excel-line mr-2"></i>
              Exportar Excel
            </button>
            <button 
              onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-add-line mr-2"></i>
              Nueva Orden
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                <i className="ri-shopping-cart-line text-xl text-blue-600"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total Órdenes</p>
                <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mr-4">
                <i className="ri-time-line text-xl text-orange-600"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Pendientes</p>
                <p className="text-2xl font-bold text-gray-900">{orders.filter(o => o.status === 'Pendiente').length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                <i className="ri-check-line text-xl text-green-600"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Aprobadas</p>
                <p className="text-2xl font-bold text-gray-900">{orders.filter(o => o.status === 'Aprobada').length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
                <i className="ri-money-dollar-circle-line text-xl text-purple-600"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Valor Total</p>
                <p className="text-2xl font-bold text-gray-900">{formatMoney(orders.reduce((sum, o) => sum + o.total, 0), 'RD$')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Estado <span className="text-red-500">*</span></label>
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Todos los Estados</option>
                <option value="Pendiente">Pendiente</option>
                <option value="Aprobada">Aprobada</option>
                <option value="Recibida">Recibida</option>
                <option value="Cancelada">Cancelada</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Proveedor</label>
              <select 
                value={filterSupplier}
                onChange={(e) => setFilterSupplier(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Todos los Proveedores</option>
                {suppliers.map((s: any) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1 flex items-end">
              <button 
                onClick={() => { setFilterStatus('all'); setFilterSupplier('all'); }}
                className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Lista de Órdenes de Compra</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Número</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proveedor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrega</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Facturado / Pendiente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{order.number}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.supplier}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.deliveryDate}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                      {formatMoney(order.total, 'RD$')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {order.orderedQtyTotal > 0 ? (
                        <div className="space-y-1">
                          <div>
                            <span className="font-medium">Facturado:</span>{' '}
                            {order.invoicedQtyTotal.toLocaleString()} / {order.orderedQtyTotal.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-500">
                            Pendiente: {order.remainingQtyTotal.toLocaleString()}
                            {order.invoicedQtyTotal > 0 && (
                              <span className="ml-2">
                                ({Math.round(order.invoicedPct)}%)
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">Sin líneas</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        order.status === 'Aprobada' ? 'bg-green-100 text-green-800' :
                        order.status === 'Pendiente' ? 'bg-orange-100 text-orange-800' :
                        order.status === 'Recibida' ? 'bg-blue-100 text-blue-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => { void printOrder(order); }}
                          className="text-gray-600 hover:text-gray-900 whitespace-nowrap"
                        >
                          <i className="ri-printer-line"></i>
                        </button>
                        <button
                          onClick={() => handleExportOrderExcel(order)}
                          className="text-green-600 hover:text-green-900 whitespace-nowrap"
                        >
                          <i className="ri-file-excel-2-line"></i>
                        </button>
                        <button 
                          onClick={() => handleEdit(order)}
                          className="text-indigo-600 hover:text-indigo-900 whitespace-nowrap"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        {order.status === 'Pendiente' && (
                          <button 
                            onClick={() => handleApprove(order.id)}
                            className="text-green-600 hover:text-green-900 whitespace-nowrap"
                          >
                            <i className="ri-check-line"></i>
                          </button>
                        )}
                        {order.status === 'Aprobada' && (
                          <button 
                            onClick={() => handleCreateSupplierInvoice(order)}
                            className="text-blue-600 hover:text-blue-900 whitespace-nowrap"
                            title="Crear Factura de Suplidor"
                          >
                            <i className="ri-file-list-3-line"></i>
                          </button>
                        )}
                        {(order.status === 'Pendiente' || order.status === 'Aprobada') && (
                          <button 
                            onClick={() => handleCancel(order.id)}
                            className="text-red-600 hover:text-red-900 whitespace-nowrap"
                          >
                            <i className="ri-close-line"></i>
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

        {/* Order Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingOrder ? 'Editar Orden de Compra' : 'Nueva Orden de Compra'}
                </h3>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Proveedor *</label>
                    <select 
                      required
                      value={formData.supplierId}
                      onChange={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          supplierId: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar proveedor</option>
                      {suppliers.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    {selectedSupplier && (
                      <div className="mt-3 text-xs sm:text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
                        <p className="font-semibold">
                          {selectedSupplier.legalName || selectedSupplier.name}
                        </p>
                        {selectedSupplier.taxId && (
                          <p>
                            <span className="font-medium">RNC / Tax ID: </span>
                            {selectedSupplier.taxId}
                          </p>
                        )}
                        {selectedSupplier.phone && (
                          <p>
                            <span className="font-medium">Teléfono: </span>
                            {selectedSupplier.phone}
                          </p>
                        )}
                        {selectedSupplier.email && (
                          <p>
                            <span className="font-medium">Email: </span>
                            {selectedSupplier.email}
                          </p>
                        )}
                        {selectedSupplier.address && (
                          <p>
                            <span className="font-medium">Dirección: </span>
                            {selectedSupplier.address}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fecha de inicio *</label>
                    <input 
                      type="date"
                      required
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fecha de Entrega *</label>
                    <input 
                      type="date"
                      required
                      value={formData.deliveryDate}
                      onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cuenta de Inventario</label>
                    <select
                      value={formData.inventoryAccountId}
                      onChange={(e) => setFormData(prev => ({ ...prev, inventoryAccountId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Sin cuenta específica</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Items */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-md font-semibold text-gray-900">Productos</h4>
                    <button 
                      type="button"
                      onClick={addProduct}
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 whitespace-nowrap"
                    >
                      <i className="ri-add-line mr-1"></i>
                      Agregar Producto
                    </button>
                  </div>
                  <div className="space-y-3">
                    {formData.products.map((item, index) => (
                      <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-3 p-3 border border-gray-200 rounded-lg">
                        <div className="md:col-span-2">
                          <select
                            value={item.itemId || ''}
                            onChange={(e) => {
                              const selectedId = e.target.value || null;
                              const selectedItem = inventoryItems.find((inv: any) => String(inv.id) === String(selectedId));
                              updateProduct(index, 'itemId', selectedId);
                              updateProduct(index, 'name', selectedItem ? selectedItem.name : '');
                              if (selectedItem) {
                                const rawPrice =
                                  selectedItem.last_purchase_price ??
                                  selectedItem.cost_price ??
                                  selectedItem.average_cost ??
                                  selectedItem.selling_price ??
                                  selectedItem.sale_price ??
                                  selectedItem.price ??
                                  0;
                                const price = Number(rawPrice) || 0;
                                updateProduct(index, 'price', price);
                              }
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          >
                            <option value="">Seleccionar producto</option>
                            {inventoryItems.map((inv: any) => (
                              <option key={inv.id} value={inv.id}>
                                {inv.name} {inv.sku ? `(${inv.sku})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <input 
                            type="number" min="0"
                            placeholder="Cantidad"
                            value={item.quantity}
                            onChange={(e) => updateProduct(index, 'quantity', Math.max(1, Math.floor(parseFloat(e.target.value || '1'))))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          />
                        </div>
                        <div>
                          <input 
                            type="number" min="0"
                            step="0.01"
                            placeholder="Precio"
                            value={item.price}
                            onChange={(e) => updateProduct(index, 'price', Math.max(0, parseFloat(e.target.value || '0')))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900">
                            {formatMoney(item.quantity * item.price, 'RD$')}
                          </span>
                          {formData.products.length > 1 && (
                            <button 
                              type="button"
                              onClick={() => removeProduct(index)}
                              className="text-red-600 hover:text-red-900 whitespace-nowrap"
                            >
                              <i className="ri-delete-bin-line"></i>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-right">
                    <p className="text-lg font-bold text-gray-900">
                      Subtotal: {formatMoney(calculateSubtotal(), 'RD$')}
                    </p>
                    <p className="text-lg font-bold text-gray-900">
                      ITBIS: {formatMoney(calculateItbis(), 'RD$')}
                    </p>
                    <p className="text-lg font-bold text-gray-900">
                      Total: {formatMoney(calculateTotal(), 'RD$')}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button 
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
                  >
                    {editingOrder ? 'Actualizar' : 'Crear'} Orden
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