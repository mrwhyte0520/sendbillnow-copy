import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { inventoryService, settingsService, chartAccountsService, journalEntriesService, accountingSettingsService, storesService, warehouseEntriesService, warehouseTransfersService, deliveryNotesService, invoicesService } from '../../services/database';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { exportToExcelWithHeaders } from '../../utils/exportImportUtils';

// Eliminados datos de ejemplo: la vista se alimenta solo de la base de datos

export default function InventoryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [items, setItems] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [warehouseEntries, setWarehouseEntries] = useState<any[]>([]);
  const [warehouseTransfers, setWarehouseTransfers] = useState<any[]>([]);
  const [entryInvoices, setEntryInvoices] = useState<any[]>([]);
  const [entryDeliveryNotes, setEntryDeliveryNotes] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string; type?: string }[]>([]);
  const [accountingSettings, setAccountingSettings] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Filtros y búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('');
  const [movementWarehouseFilter, setMovementWarehouseFilter] = useState('');
  const [movementDateFrom, setMovementDateFrom] = useState('');
  const [movementDateTo, setMovementDateTo] = useState('');
  const [movementSourceFilter, setMovementSourceFilter] = useState('');
  const [movementStoreFilter, setMovementStoreFilter] = useState('');
  const [warehouseEntryLines, setWarehouseEntryLines] = useState<any[]>([
    { inventory_item_id: '', quantity: '', unit_cost: '', notes: '' },
  ]);
  const [transferLines, setTransferLines] = useState<any[]>([
    { inventory_item_id: '', quantity: '', notes: '' },
  ]);

  useEffect(() => {
    if (user) {
      loadData();
      loadWarehouses();
      loadStores();
      loadAccounts();
      loadAccountingSettings();
    } else {
      // Sin usuario: limpiar datos (no usar datos de ejemplo)
      setItems([]);
      setMovements([]);
      setWarehouseEntries([]);
      setWarehouseTransfers([]);
      setLoading(false);
    }
  }, [user, activeTab]);

  useEffect(() => {
    const loadEntrySources = async () => {
      if (!user?.id || modalType !== 'warehouse_entry') return;
      try {
        const [invoices, notes] = await Promise.all([
          invoicesService.getAll(user.id),
          deliveryNotesService.getAll(user.id),
        ]);
        setEntryInvoices(invoices || []);
        setEntryDeliveryNotes(notes || []);
      } catch (error) {
        console.error('Error loading warehouse entry sources:', error);
        setEntryInvoices([]);
        setEntryDeliveryNotes([]);
      }
    };
    loadEntrySources();
  }, [user?.id, modalType]);

  useEffect(() => {
    const loadEntriesIfNeeded = async () => {
      if (user && activeTab === 'entries') {
        try {
          const data = await warehouseEntriesService.getAll(user.id);
          setWarehouseEntries(data || []);
        } catch (error) {
          console.error('Error loading warehouse entries:', error);
          setWarehouseEntries([]);
        }
      }
    };
    loadEntriesIfNeeded();
  }, [user, activeTab]);

  useEffect(() => {
    const loadTransfersIfNeeded = async () => {
      if (user && activeTab === 'transfers') {
        try {
          const data = await warehouseTransfersService.getAll(user.id);
          setWarehouseTransfers(data || []);
        } catch (error) {
          console.error('Error loading warehouse transfers:', error);
          setWarehouseTransfers([]);
        }
      }
    };
    loadTransfersIfNeeded();
  }, [user, activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      let itemsData = [];
      let movementsData = [];
      
      if (activeTab === 'items' || activeTab === 'dashboard' || activeTab === 'warehouses' || activeTab === 'transfers') {
        try {
          itemsData = await inventoryService.getItems(user!.id);
          // Si no hay datos, dejar vacío
          if (!itemsData || itemsData.length === 0) {
            itemsData = [];
          }
        } catch (error) {
          console.warn('Error loading items:', error);
          itemsData = [];
        }
        setItems(itemsData);
      }
      
      if (activeTab === 'movements' || activeTab === 'dashboard' || activeTab === 'warehouses' || activeTab === 'transfers') {
        try {
          movementsData = await inventoryService.getMovements(user!.id);
          // Si no hay datos, dejar vacío
          if (!movementsData || movementsData.length === 0) {
            movementsData = [];
          }
        } catch (error) {
          console.warn('Error loading movements:', error);
          movementsData = [];
        }
        setMovements(movementsData);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      // En caso de error, dejar vacío
      setItems([]);
      setMovements([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWarehouseProducts = async (warehouse: any) => {
    const productsInWarehouse = items.filter((item) => item.warehouse_id === warehouse.id);
    const productCount = productsInWarehouse.length;

    if (productCount === 0) {
      alert('Este almacén no tiene productos asignados.');
      return;
    }

    if (!confirm(`¿Eliminar definitivamente los ${productCount} productos de este almacén? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      for (const product of productsInWarehouse) {
        await inventoryService.deleteItem(product.id);
      }

      if (user) {
        await loadData();
      }
      await loadWarehouses();
      alert('Productos eliminados del almacén correctamente');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error deleting warehouse products:', error);
      alert('No se pudieron eliminar todos los productos del almacén');
    }
  };

  const loadAccounts = async () => {
    try {
      if (!user?.id) {
        setAccounts([]);
        return;
      }
      const data = await chartAccountsService.getAll(user.id);
      const options = (data || [])
        .filter((acc: any) => acc.allow_posting !== false)
        .map((acc: any) => ({ id: acc.id, code: acc.code, name: acc.name, type: acc.type }));
      setAccounts(options);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading accounts:', error);
      setAccounts([]);
    }
  };

  const loadAccountingSettings = async () => {
    try {
      if (!user?.id) {
        setAccountingSettings(null);
        return;
      }
      const settings = await accountingSettingsService.get(user.id);
      setAccountingSettings(settings);
    } catch (error) {
      console.error('Error loading accounting settings:', error);
      setAccountingSettings(null);
    }
  };

  const handleDeleteWarehouse = async (warehouse: any) => {
    const productCount = items.filter((item) => item.warehouse_id === warehouse.id).length;
    if (productCount > 0) {
      alert('No puedes eliminar este almacén porque tiene productos asignados. Mueve o elimina los productos primero.');
      return;
    }

    if (!confirm('¿Eliminar este almacén? Esta acción no se puede deshacer.')) return;

    try {
      await settingsService.deleteWarehouse(warehouse.id);
      await loadWarehouses();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error deleting warehouse:', error);
      alert('No se pudo eliminar el almacén');
    }
  };

  const loadWarehouses = async () => {
    try {
      const data = await settingsService.getWarehouses();
      setWarehouses(data || []);
    } catch (error) {
      console.error('Error loading warehouses:', error);
      setWarehouses([]);
    }
  };

  const loadStores = async () => {
    try {
      if (!user?.id) {
        setStores([]);
        return;
      }
      const data = await storesService.getAll(user.id);
      setStores(data || []);
    } catch (error) {
      console.error('Error loading stores:', error);
      setStores([]);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!user?.id) {
        alert('Debes iniciar sesión para subir imágenes de productos');
        return;
      }

      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `${user.id}/products/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('Error uploading product image to Supabase Storage:', uploadError);
        alert('No se pudo subir la imagen del producto');
        return;
      }

      const { data: publicData } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      const publicUrl = publicData?.publicUrl;
      if (!publicUrl) {
        alert('No se pudo obtener la URL pública de la imagen');
        return;
      }

      setFormData((prev: any) => ({ ...prev, image_url: publicUrl }));
    } catch (error) {
      console.error('handleImageUpload error', error);
      alert('Ocurrió un error al procesar la imagen');
    }
  };

  const handleOpenModal = (type: string, item: any = null) => {
    setModalType(type);
    setSelectedItem(item);

    const baseForm: any = item ? { ...item } : {};
    if (!item && type === 'item' && !baseForm.warehouse_id && warehouses.length > 0) {
      baseForm.warehouse_id = warehouses[0].id;
    }

    if (!item && type === 'warehouse_entry') {
      baseForm.document_date = new Date().toISOString().slice(0, 10);
      baseForm.source_type = '';
      if (warehouses.length > 0) {
        baseForm.warehouse_id = warehouses[0].id;
      }
      setWarehouseEntryLines([{ inventory_item_id: '', quantity: '', unit_cost: '', notes: '' }]);
    }

    if (!item && type === 'warehouse_transfer') {
      baseForm.transfer_date = new Date().toISOString().slice(0, 10);
      if (warehouses.length > 0) {
        baseForm.from_warehouse_id = warehouses[0].id;
        baseForm.to_warehouse_id = warehouses.length > 1 ? warehouses[1].id : warehouses[0].id;
      }
      setTransferLines([{ inventory_item_id: '', quantity: '', notes: '' }]);
    }

    if (!item && type === 'item') {
      const itemType = baseForm.item_type || 'inventory';
      if (itemType === 'inventory' && accountingSettings) {
        if (!baseForm.inventory_account_id && accountingSettings.default_inventory_asset_account_id) {
          baseForm.inventory_account_id = accountingSettings.default_inventory_asset_account_id;
        }
        if (!baseForm.income_account_id && accountingSettings.default_inventory_income_account_id) {
          baseForm.income_account_id = accountingSettings.default_inventory_income_account_id;
        }
        if (!baseForm.cogs_account_id && accountingSettings.default_inventory_cogs_account_id) {
          baseForm.cogs_account_id = accountingSettings.default_inventory_cogs_account_id;
        }
        baseForm.item_type = itemType;
      }
    }

    setFormData(baseForm);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setModalType('');
    setSelectedItem(null);
    setFormData({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (modalType === 'item') {
        if (user) {
          // Validaciones numéricas básicas
          const errors: string[] = [];

          const numCurrent = Number(formData.current_stock);
          const numMin = Number(formData.minimum_stock);
          const numMax = Number(formData.maximum_stock);
          const numCost = Number(formData.cost_price);
          const numSelling = Number(formData.selling_price);

          if (numCurrent < 0) errors.push('El stock actual no puede ser negativo.');
          if (numMin < 0) errors.push('El stock mínimo no puede ser negativo.');
          if (numMax < 0) errors.push('El stock máximo no puede ser negativo.');
          if (numCost < 0) errors.push('El precio de compra no puede ser negativo.');
          if (numSelling < 0) errors.push('El precio de venta no puede ser negativo.');

          if (errors.length > 0) {
            alert(errors.join('\n'));
            return;
          }

          // Validación: stock máximo no puede ser menor que stock actual para productos inventariables
          const rawCurrentStock = numCurrent;
          const rawMaximumStock = numMax;
          const currentStock = Number.isFinite(rawCurrentStock) ? Math.round(rawCurrentStock) : 0;
          const maximumStock = Number.isFinite(rawMaximumStock) ? Math.round(rawMaximumStock) : 0;

          if (
            (formData.item_type === 'inventory' || !formData.item_type) &&
            Number.isFinite(rawCurrentStock) &&
            Number.isFinite(rawMaximumStock) &&
            maximumStock < currentStock
          ) {
            alert('El stock máximo no puede ser menor que el stock actual.');
            return;
          }

          // Normalizar campos numéricos antes de guardar
          const normalizedItem = {
            ...formData,
            current_stock: Number.isFinite(Number(formData.current_stock))
              ? Math.round(Number(formData.current_stock))
              : 0,
            minimum_stock: Number.isFinite(Number(formData.minimum_stock))
              ? Math.round(Number(formData.minimum_stock))
              : 0,
            maximum_stock: Number.isFinite(Number(formData.maximum_stock))
              ? Math.round(Number(formData.maximum_stock))
              : 0,
            cost_price: Number(formData.cost_price) || 0,
            selling_price: Number(formData.selling_price) || 0,
            item_type: formData.item_type || 'inventory',
            is_commissionable: formData.is_commissionable !== false,
            warehouse_id: formData.warehouse_id || null,
            inventory_account_id: formData.inventory_account_id || null,
            income_account_id: formData.income_account_id || null,
            asset_account_id: formData.asset_account_id || null,
            cogs_account_id: formData.cogs_account_id || null,
          };

          // Si hay usuario, intentar guardar en la base de datos
          if (selectedItem) {
            await inventoryService.updateItem(selectedItem.id, normalizedItem);
          } else {
            await inventoryService.createItem(user!.id, {
              ...normalizedItem,
              sku: formData.sku || `SKU${Date.now()}`,
              is_active: formData.is_active !== false
            });
          }
        }
      } else if (modalType === 'movement') {
        if (user) {
          const movementDate = formData.movement_date || new Date().toISOString().split('T')[0];
          const rawQuantity = Number(formData.quantity) || 0;
          const quantity = Number.isFinite(rawQuantity) ? Math.round(rawQuantity) : 0;
          const unitCost = Number(formData.unit_cost) || 0;
          const totalCost = quantity * unitCost;

          // No enviar account_id a la tabla inventory_movements (solo se usa para el asiento)
          const { account_id, warehouse_id: _ignoredWarehouse, ...movementRest } = formData;

          const createdMovement = await inventoryService.createMovement(user!.id, {
            ...movementRest,
            quantity,
            movement_date: movementDate,
            total_cost: totalCost,
          });

          // Actualizar stock actual del producto afectado de forma coherente con el movimiento
          try {
            const item = items.find((it) => String(it.id) === String(formData.item_id));
            if (item && formData.movement_type) {
              const currentStock = Number(item.current_stock ?? 0) || 0;
              let newStock = currentStock;

              if (formData.movement_type === 'entry') {
                newStock = currentStock + quantity;
              } else if (formData.movement_type === 'exit') {
                newStock = currentStock - quantity;
              } else if (formData.movement_type === 'adjustment') {
                // Los ajustes pueden ser positivos (aumento) o negativos (disminución)
                // El usuario indica si es positivo o negativo con adjustment_direction
                const isPositive = formData.adjustment_direction !== 'negative';
                newStock = isPositive ? currentStock + quantity : currentStock - quantity;
              }

              if (newStock < 0) newStock = 0;

              await inventoryService.updateItem(item.id, {
                current_stock: newStock,
              });
            }
          } catch (stockError) {
            console.error('Error updating current stock for manual inventory movement', stockError);
          }

          // Best-effort: registrar asiento contable del movimiento de inventario
          try {
            const item = items.find((it) => String(it.id) === String(formData.item_id));
            const inventoryAccountId = item?.inventory_account_id as string | undefined;
            const counterAccountId = account_id as string | undefined;

            if (inventoryAccountId && counterAccountId && totalCost > 0 && formData.movement_type) {
              const lines: any[] = [];

              if (formData.movement_type === 'entry') {
                lines.push(
                  {
                    account_id: inventoryAccountId,
                    description: 'Entrada manual de inventario',
                    debit_amount: totalCost,
                    credit_amount: 0,
                  },
                  {
                    account_id: counterAccountId,
                    description: 'Contrapartida entrada inventario',
                    debit_amount: 0,
                    credit_amount: totalCost,
                  },
                );
              } else if (formData.movement_type === 'exit') {
                lines.push(
                  {
                    account_id: counterAccountId,
                    description: 'Gasto por salida de inventario',
                    debit_amount: totalCost,
                    credit_amount: 0,
                  },
                  {
                    account_id: inventoryAccountId,
                    description: 'Salida manual de inventario',
                    debit_amount: 0,
                    credit_amount: totalCost,
                  },
                );
              } else if (formData.movement_type === 'adjustment') {
                // Los ajustes pueden ser positivos (aumento) o negativos (disminución)
                const isPositive = formData.adjustment_direction !== 'negative';
                if (isPositive) {
                  // Ajuste positivo: débito inventario, crédito contrapartida
                  lines.push(
                    {
                      account_id: inventoryAccountId,
                      description: 'Ajuste de inventario (aumento)',
                      debit_amount: totalCost,
                      credit_amount: 0,
                    },
                    {
                      account_id: counterAccountId,
                      description: 'Contrapartida ajuste inventario',
                      debit_amount: 0,
                      credit_amount: totalCost,
                    },
                  );
                } else {
                  // Ajuste negativo: crédito inventario, débito contrapartida (gasto/pérdida)
                  lines.push(
                    {
                      account_id: counterAccountId,
                      description: 'Pérdida/Merma de inventario',
                      debit_amount: totalCost,
                      credit_amount: 0,
                    },
                    {
                      account_id: inventoryAccountId,
                      description: 'Ajuste de inventario (disminución)',
                      debit_amount: 0,
                      credit_amount: totalCost,
                    },
                  );
                }
              }

              if (lines.length > 0) {
                const entryPayload = {
                  entry_number: `INV-MOV-${createdMovement.id}`,
                  entry_date: movementDate,
                  description: `Movimiento de inventario ${formData.movement_type}`,
                  reference: createdMovement.id ? String(createdMovement.id) : null,
                  status: 'posted' as const,
                };

                await journalEntriesService.createWithLines(user.id, entryPayload, lines);
              }
            }
          } catch (jeError) {
            // eslint-disable-next-line no-console
            console.error('Error posting inventory movement to ledger', jeError);
          }
        }
      } else if (modalType === 'warehouse') {
        if (selectedItem && selectedItem.id) {
          await settingsService.updateWarehouse(selectedItem.id, {
            name: formData.name,
            location: formData.location,
            description: formData.description || null,
          });
        } else {
          await settingsService.createWarehouse({
            name: formData.name,
            location: formData.location,
            description: formData.description || null,
            active: true,
          });
        }
        await loadWarehouses();
      } else if (modalType === 'warehouse_entry') {
        if (!user) {
          alert('Debes iniciar sesión para registrar entradas de almacén');
          return;
        }

        const validLines = warehouseEntryLines
          .map((l) => ({
            ...l,
            quantity: Number(l.quantity) || 0,
            unit_cost: l.unit_cost !== '' ? Number(l.unit_cost) || 0 : null,
          }))
          .filter((l) => l.inventory_item_id && l.quantity > 0);

        if (validLines.length === 0) {
          alert('Debes agregar al menos una línea con cantidad válida e ítem seleccionado');
          return;
        }

        const extraRefs: string[] = [];
        if (formData.related_invoice_id) {
          extraRefs.push(`Factura afectada: ${formData.related_invoice_id}`);
        }
        if (formData.related_delivery_note_id) {
          extraRefs.push(`Conduce afectado: ${formData.related_delivery_note_id}`);
        }
        const fullDescription = [formData.description, extraRefs.length ? extraRefs.join(' | ') : null]
          .filter(Boolean)
          .join(' | ');

        const entryPayload: any = {
          warehouse_id: formData.warehouse_id,
          source_type: formData.source_type || null,
          related_invoice_id: formData.related_invoice_id || null,
          related_delivery_note_id: formData.related_delivery_note_id || null,
          issuer_name: formData.issuer_name || null,
          document_number: formData.document_number || null,
          document_date: formData.document_date || new Date().toISOString().slice(0, 10),
          description: fullDescription || null,
          status: 'draft',
        };

        const linesPayload = validLines.map((l, index) => ({
          inventory_item_id: l.inventory_item_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          notes: l.notes || null,
        }));

        try {
          const created = await warehouseEntriesService.create(user.id, entryPayload, linesPayload);
          await warehouseEntriesService.post(user.id, created.entry.id);
          const data = await warehouseEntriesService.getAll(user.id);
          setWarehouseEntries(data || []);
          alert('Entrada de almacén registrada correctamente');
        } catch (err: any) {
          console.error('Error creating warehouse entry:', err);
          alert(`Error al registrar la entrada de almacén: ${err?.message || 'revisa la consola para más detalles'}`);
          return;
        }
      } else if (modalType === 'warehouse_transfer') {
        if (!user) {
          alert('Debes iniciar sesión para registrar transferencias de almacén');
          return;
        }

        if (!formData.from_warehouse_id || !formData.to_warehouse_id) {
          alert('Debes seleccionar almacén origen y destino');
          return;
        }
        if (formData.from_warehouse_id === formData.to_warehouse_id) {
          alert('El almacén origen y destino no pueden ser el mismo');
          return;
        }

        const validLines = transferLines
          .map((l) => ({
            ...l,
            quantity: Number(l.quantity) || 0,
          }))
          .filter((l) => l.inventory_item_id && l.quantity > 0);

        if (validLines.length === 0) {
          alert('Debes agregar al menos una línea con cantidad válida e ítem seleccionado');
          return;
        }

        const overRequested: string[] = [];
        const aggregatedByItem: any = {};

        for (const line of validLines) {
          const item = items.find((it) => String(it.id) === String(line.inventory_item_id));
          if (!item) continue;

          if (
            formData.from_warehouse_id &&
            String(item.warehouse_id) !== String(formData.from_warehouse_id)
          ) {
            continue;
          }

          const id = String(item.id);
          const requestedSoFar = aggregatedByItem[id]?.requested || 0;
          const qty = Number(line.quantity) || 0;
          const available = Number(item.current_stock ?? 0) || 0;

          aggregatedByItem[id] = {
            requested: requestedSoFar + qty,
            available,
            name: item.name || '',
          };
        }

        Object.values(aggregatedByItem).forEach((entry: any) => {
          if (entry.requested > entry.available) {
            overRequested.push(
              `${entry.name || 'Producto'}: solicitado ${entry.requested}, disponible ${entry.available}`,
            );
          }
        });

        if (overRequested.length > 0) {
          alert(
            'No puedes transferir más cantidad de la disponible en el almacén origen para:\n' +
              overRequested.join('\n'),
          );
          return;
        }

        const transferPayload: any = {
          from_warehouse_id: formData.from_warehouse_id,
          to_warehouse_id: formData.to_warehouse_id,
          transfer_date: formData.transfer_date || new Date().toISOString().slice(0, 10),
          document_number: formData.document_number || null,
          description: formData.description || null,
          status: 'draft',
        };

        const linesPayload = validLines.map((l) => ({
          inventory_item_id: l.inventory_item_id,
          quantity: l.quantity,
          notes: l.notes || null,
        }));

        try {
          const created = await warehouseTransfersService.create(user.id, transferPayload, linesPayload);
          await warehouseTransfersService.post(user.id, created.transfer.id);
          const data = await warehouseTransfersService.getAll(user.id);
          setWarehouseTransfers(data || []);
          alert('Transferencia de almacén registrada correctamente');
        } catch (err: any) {
          console.error('Error creating warehouse transfer:', err);
          alert(`Error al registrar la transferencia de almacén: ${err?.message || 'revisa la consola para más detalles'}`);
          return;
        }
      }
      
      handleCloseModal();
      if (user) {
        loadData();
      }
    } catch (error: any) {
      console.error('Error saving data:', error);
      const parts = [
        error?.message ? String(error.message) : null,
        error?.code ? `code: ${String(error.code)}` : null,
        error?.details ? `details: ${String(error.details)}` : null,
        error?.hint ? `hint: ${String(error.hint)}` : null,
      ].filter(Boolean);
      const msg = parts.length > 0 ? parts.join('\n') : 'Revisa la consola para más detalles.';
      alert(`Error al guardar los datos:\n${msg}`);
    }
  };

  const handleDelete = async (id: any) => {
    if (!confirm('¿Está seguro de que desea eliminar este elemento?')) return;
    
    try {
      if (user) {
        await inventoryService.deleteItem(id);
        loadData();
      }
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Error al eliminar el elemento. Por favor, inténtelo de nuevo.');
    }
  };

  const generateSKU = () => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `INV-${timestamp}-${random}`;
  };

  // Funciones de exportación
  const exportToExcel = async () => {
    const isItemsTab = activeTab === 'items';
    const dataToExport = isItemsTab ? filteredItems : filteredMovements;

    if (!dataToExport || dataToExport.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    let companyName = 'ContaBi';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName = (info as any).name || (info as any).company_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error obteniendo información de la empresa para Excel de inventario:', error);
    }

    const periodText = `Periodo: ${new Date().toISOString().slice(0, 7)}`;

    if (isItemsTab) {
      const rows = dataToExport.map((item: any) => ({
        sku: item.sku,
        name: item.name,
        category: item.category || 'N/A',
        current_stock: item.current_stock,
        minimum_stock: item.minimum_stock || 0,
        cost_price: item.cost_price || 0,
        selling_price: item.selling_price || 0,
        status: item.is_active ? 'Activo' : 'Inactivo',
      }));

      const headers = [
        { key: 'sku', title: 'SKU' },
        { key: 'name', title: 'Nombre' },
        { key: 'category', title: 'Categoría' },
        { key: 'current_stock', title: 'Stock Actual' },
        { key: 'minimum_stock', title: 'Stock Mínimo' },
        { key: 'cost_price', title: 'Precio Costo' },
        { key: 'selling_price', title: 'Precio Venta' },
        { key: 'status', title: 'Estado' },
      ];

      const fileBase = `inventario_productos_${new Date().toISOString().split('T')[0]}`;
      const title = 'Productos en Inventario';

      exportToExcelWithHeaders(rows, headers, fileBase, 'Productos', [16, 30, 22, 16, 16, 16, 16, 14], {
        title,
        companyName,
        headerStyle: 'dgii_606',
        periodText,
      });
    } else {
      const rows = dataToExport.map((movement: any) => ({
        movement_date: movement.movement_date,
        product_name: movement.inventory_items?.name || 'N/A',
        type:
          movement.movement_type === 'entry'
            ? 'Entrada'
            : movement.movement_type === 'exit'
            ? 'Salida'
            : movement.movement_type === 'transfer'
            ? 'Transferencia'
            : 'Ajuste',
        quantity: movement.quantity,
        unit_cost: movement.unit_cost || 0,
        total_cost: movement.total_cost || 0,
        reference: movement.reference || 'N/A',
      }));

      const headers = [
        { key: 'movement_date', title: 'Fecha' },
        { key: 'product_name', title: 'Producto' },
        { key: 'type', title: 'Tipo' },
        { key: 'quantity', title: 'Cantidad' },
        { key: 'unit_cost', title: 'Costo Unitario' },
        { key: 'total_cost', title: 'Costo Total' },
        { key: 'reference', title: 'Referencia' },
      ];

      const fileBase = `inventario_movimientos_${new Date().toISOString().split('T')[0]}`;
      const title = 'Movimientos de Inventario';

      exportToExcelWithHeaders(
        rows,
        headers,
        fileBase,
        'Movimientos',
        [16, 30, 18, 14, 18, 18, 26],
        {
          title,
          companyName,
          headerStyle: 'dgii_606',
          periodText,
        },
      );
    }
  };

  const exportValuationToExcel = async () => {
    if (!items || items.length === 0) {
      alert('No hay datos para generar el reporte de valorización.');
      return;
    }

    let companyName = 'ContaBi';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName =
          (info as any).name ||
          (info as any).company_name ||
          (info as any).legal_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error obteniendo información de la empresa para Excel de valorización:', error);
    }

    const periodText = `Periodo: ${new Date().toISOString().slice(0, 7)}`;

    const rows = items.map((item: any) => {
      const stock = Number(item.current_stock || 0) || 0;
      const costPrice = Number(item.cost_price || 0) || 0;
      const sellingPrice = Number(item.selling_price || 0) || 0;

      return {
        product: item.name,
        stock,
        cost_price: costPrice,
        selling_price: sellingPrice,
        value_cost: stock * costPrice,
        value_sale: stock * sellingPrice,
      };
    });

    const headers = [
      { key: 'product', title: 'Producto' },
      { key: 'stock', title: 'Stock' },
      { key: 'cost_price', title: 'Precio Costo' },
      { key: 'selling_price', title: 'Precio Venta' },
      { key: 'value_cost', title: 'Valor Costo' },
      { key: 'value_sale', title: 'Valor Venta' },
    ];

    const fileBase = `valorizacion_inventario_${new Date().toISOString().split('T')[0]}`;
    const title = 'Valorización de Inventario (Costo y Venta)';

    exportToExcelWithHeaders(
      rows,
      headers,
      fileBase,
      'Valorización',
      [32, 12, 16, 16, 18, 18],
      {
        title,
        companyName,
        headerStyle: 'dgii_606',
        periodText,
      },
    );
  };

  // Filtros aplicados
  const filteredItems = items.filter(item => {
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !categoryFilter || item.category === categoryFilter;
    const matchesStatus = !statusFilter || 
                         (statusFilter === 'active' && item.is_active) ||
                         (statusFilter === 'inactive' && !item.is_active) ||
                         (statusFilter === 'low_stock' && item.current_stock <= item.minimum_stock);
    const matchesWarehouse = !warehouseFilter || item.warehouse_id === warehouseFilter;

    return matchesSearch && matchesCategory && matchesStatus && matchesWarehouse;
  });

  const filteredMovements = movements.filter(movement => {
    const matchesSearch = movement.inventory_items?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         movement.reference?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !movementTypeFilter || movement.movement_type === movementTypeFilter;

    const matchesWarehouse =
      !movementWarehouseFilter ||
      movement.inventory_items?.warehouse_id === movementWarehouseFilter;

    const sourceType = (movement.source_type || 'manual') as string;
    const matchesSourceType = !movementSourceFilter || sourceType === movementSourceFilter;

    const matchesStore = !movementStoreFilter || movement.store_id === movementStoreFilter;

    const movementDate = movement.movement_date ? new Date(movement.movement_date) : null;
    const fromDate = movementDateFrom ? new Date(movementDateFrom) : null;
    const toDate = movementDateTo ? new Date(movementDateTo) : null;

    const matchesFrom = !fromDate || (movementDate && movementDate >= fromDate);
    const matchesTo = !toDate || (movementDate && movementDate <= toDate);

    return matchesSearch && matchesType && matchesWarehouse && matchesSourceType && matchesStore && matchesFrom && matchesTo;
  });

  const warehouseBalances: any = {};
  const itemMap: any = {};

  items.forEach((it: any) => {
    if (it && it.id) {
      itemMap[String(it.id)] = it;
    }
  });

  const adjustWarehouseBalance = (warehouseId: any, itemId: any, delta: number) => {
    if (!warehouseId || !itemId || !Number.isFinite(delta)) return;
    const wid = String(warehouseId);
    const iid = String(itemId);
    if (!warehouseBalances[wid]) {
      warehouseBalances[wid] = {};
    }
    const prev = Number(warehouseBalances[wid][iid] ?? 0) || 0;
    warehouseBalances[wid][iid] = prev + delta;
  };

  // Base: cada producto aporta su current_stock completo a su almacén asignado
  items.forEach((it: any) => {
    if (!it || !it.id || !it.warehouse_id) return;
    const baseQty = Number(it.current_stock ?? 0) || 0;
    if (!baseQty) return;
    adjustWarehouseBalance(it.warehouse_id, it.id, baseQty);
  });

  // Ajustes: solo las transferencias mueven stock entre almacenes
  movements.forEach((movement: any) => {
    const qty = Number(movement.quantity) || 0;
    if (!qty) return;

    const itemId =
      movement.item_id ||
      movement.inventory_item_id ||
      movement.inventory_items?.id;
    if (!itemId) return;

    const type = (movement.movement_type || '').toString();

    if (type === 'transfer') {
      const fromWarehouse = movement.from_warehouse_id;
      const toWarehouse = movement.to_warehouse_id;
      adjustWarehouseBalance(fromWarehouse, itemId, -qty);
      adjustWarehouseBalance(toWarehouse, itemId, qty);
    }
  });

  const getWarehouseStats = (warehouseId: any) => {
    const wid = String(warehouseId);
    const balances = warehouseBalances[wid] || {};
    const itemIds = Object.keys(balances).filter(
      (id) => (Number(balances[id]) || 0) > 0,
    );

    const stockTotal = itemIds.reduce(
      (sum, id) => sum + (Number(balances[id]) || 0),
      0,
    );

    const valueTotal = itemIds.reduce((sum, id) => {
      const item = itemMap[id];
      if (!item) return sum;
      const cost =
        item.average_cost != null && item.average_cost !== ''
          ? Number(item.average_cost) || 0
          : Number(item.cost_price) || 0;
      const qty = Number(balances[id]) || 0;
      return sum + qty * cost;
    }, 0);

    return {
      products: itemIds.length,
      stockTotal,
      valueTotal,
    };
  };

  const categories = [...new Set(items.map(item => item.category).filter(Boolean))];

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Estadísticas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="ri-box-3-line text-blue-600"></i>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Productos</p>
              <p className="text-2xl font-semibold text-gray-900">{items.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <i className="ri-stock-line text-green-600"></i>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Productos Activos</p>
              <p className="text-2xl font-semibold text-gray-900">
                {items.filter(item => item.is_active).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                <i className="ri-alert-line text-red-600"></i>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Stock Bajo</p>
              <p className="text-2xl font-semibold text-gray-900">
                {items.filter(item => item.current_stock <= item.minimum_stock).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <i className="ri-arrow-up-down-line text-purple-600"></i>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Movimientos Hoy</p>
              <p className="text-2xl font-semibold text-gray-900">
                {movements.filter(m => 
                  new Date(m.movement_date).toDateString() === new Date().toDateString()
                ).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Valor total del inventario */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Resumen Financiero</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Valor Total Costo (Promedio)</p>
            <p className="text-2xl font-bold text-blue-600">
              ${items
                .reduce((sum, item) => {
                  const cost = item.average_cost ?? item.cost_price ?? 0;
                  return sum + ((item.current_stock || 0) * cost);
                }, 0)
                .toLocaleString('es-DO')}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Valor Total Venta</p>
            <p className="text-2xl font-bold text-green-600">
              ${items
                .reduce((sum, item) => sum + ((item.current_stock || 0) * (item.selling_price || 0)), 0)
                .toLocaleString('es-DO')}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Ganancia Potencial</p>
            <p className="text-2xl font-bold text-purple-600">
              ${items
                .reduce((sum, item) => {
                  const cost = item.average_cost ?? item.cost_price ?? 0;
                  return sum + ((item.current_stock || 0) * ((item.selling_price || 0) - cost));
                }, 0)
                .toLocaleString('es-DO')}
            </p>
          </div>
        </div>
      </div>

      {/* Productos con stock bajo */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Productos con Stock Bajo</h3>
        </div>
        <div className="p-6">
          {items.filter(item => item.current_stock <= item.minimum_stock).length === 0 ? (
            <p className="text-gray-500 text-center py-4">No hay productos con stock bajo</p>
          ) : (
            <div className="space-y-3">
              {items.filter(item => item.current_stock <= item.minimum_stock).slice(0, 5).map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-500">SKU: {item.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-red-600">
                      Stock: {item.current_stock} {item.unit_of_measure}
                    </p>
                    <p className="text-xs text-gray-500">
                      Mínimo: {item.minimum_stock}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Movimientos recientes */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Movimientos Recientes</h3>
        </div>
        <div className="p-6">
          {movements.slice(0, 5).length === 0 ? (
            <p className="text-gray-500 text-center py-4">No hay movimientos recientes</p>
          ) : (
            <div className="space-y-3">
              {movements.slice(0, 5).map(movement => (
                <div key={movement.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{movement.inventory_items?.name}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(movement.movement_date).toLocaleDateString('es-DO')}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      movement.movement_type === 'entry' ? 'bg-green-100 text-green-800' :
                      movement.movement_type === 'exit' ? 'bg-red-100 text-red-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {movement.movement_type === 'entry' ? 'Entrada' :
                       movement.movement_type === 'exit' ? 'Salida' :
                       movement.movement_type === 'transfer' ? 'Transferencia' : 'Ajuste'}
                    </span>
                    <p className="text-sm text-gray-500 mt-1">
                      Cantidad: {movement.quantity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderItems = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-900">Productos en Inventario</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportToExcel}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-file-excel-line mr-2"></i>
            Exportar Excel
          </button>
          <button
            onClick={() => handleOpenModal('item')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2"></i>
            Agregar Producto
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buscar
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre o SKU..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categoría
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
            >
              <option value="">Todas las categorías</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estado
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
            >
              <option value="">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
              <option value="low_stock">Stock Bajo</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setCategoryFilter('');
                setStatusFilter('');
              }}
              className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors whitespace-nowrap"
            >
              <i className="ri-refresh-line mr-2"></i>
              Limpiar Filtros
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Precio Costo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Precio Venta</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {item.sku}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {item.category || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <span className={`${item.current_stock <= item.minimum_stock ? 'text-red-600 font-semibold' : ''}`}>
                      {item.current_stock} {item.unit_of_measure}
                    </span>
                    {item.minimum_stock && (
                      <div className="text-xs text-gray-500">
                        Mín: {item.minimum_stock}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(() => {
                      const cost = item.average_cost ?? item.cost_price ?? 0;
                      return `$${cost.toLocaleString('es-DO')}`;
                    })()}
                    {item.last_purchase_price != null && (
                      <div className="text-xs text-gray-500">
                        Última compra: ${item.last_purchase_price.toLocaleString('es-DO')}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${item.selling_price?.toLocaleString('es-DO') || '0'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      item.is_active 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {item.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleOpenModal('item', item)}
                      className="text-blue-600 hover:text-blue-900"
                      title="Editar"
                    >
                      <i className="ri-edit-line"></i>
                    </button>
                    <button
                      onClick={() => handleOpenModal('movement', { item_id: item.id, item_name: item.name })}
                      className="text-green-600 hover:text-green-900"
                      title="Nuevo Movimiento"
                    >
                      <i className="ri-arrow-up-down-line"></i>
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-red-600 hover:text-red-900"
                      title="Eliminar"
                    >
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredItems.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">No se encontraron productos</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderMovements = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-900">Movimientos de Inventario</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportToExcel}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-file-excel-line mr-2"></i>
            Exportar Excel
          </button>
          <button
            onClick={() => handleOpenModal('movement')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2"></i>
            Nuevo Movimiento
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buscar
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por producto o referencia..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de Movimiento
            </label>
            <select
              value={movementTypeFilter}
              onChange={(e) => setMovementTypeFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
            >
              <option value="">Todos los tipos</option>
              <option value="entry">Entrada</option>
              <option value="exit">Salida</option>
              <option value="transfer">Transferencia</option>
              <option value="adjustment">Ajuste</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de documento
            </label>
            <select
              value={movementSourceFilter}
              onChange={(e) => setMovementSourceFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
            >
              <option value="">Todos los documentos</option>
              <option value="manual">Manual</option>
              <option value="purchase_order">Orden de compra</option>
              <option value="delivery_note">Conduce</option>
              <option value="pos_sale">Venta POS</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rango de fechas
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={movementDateFrom}
                onChange={(e) => setMovementDateFrom(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="date"
                value={movementDateTo}
                onChange={(e) => setMovementDateTo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tienda / Almacén
            </label>
            <select
              value={movementStoreFilter}
              onChange={(e) => setMovementStoreFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
            >
              <option value="">Todas las tiendas</option>
              {stores.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
            <select
              value={movementWarehouseFilter}
              onChange={(e) => setMovementWarehouseFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
            >
              <option value="">Todos los almacenes</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setSearchTerm('');
                setMovementTypeFilter('');
                setMovementWarehouseFilter('');
                setMovementDateFrom('');
                setMovementDateTo('');
                setMovementSourceFilter('');
                setMovementStoreFilter('');
              }}
              className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors whitespace-nowrap"
            >
              <i className="ri-refresh-line mr-2"></i>
              Limpiar Filtros
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cantidad</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Costo Unitario</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Costo Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Referencia</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notas</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredMovements.map((movement) => (
                <tr key={movement.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(movement.movement_date).toLocaleDateString('es-DO')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {movement.inventory_items?.name || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      movement.movement_type === 'entry' ? 'bg-green-100 text-green-800' :
                      movement.movement_type === 'exit' ? 'bg-red-100 text-red-800' :
                      movement.movement_type === 'transfer' ? 'bg-blue-100 text-blue-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {movement.movement_type === 'entry' ? 'Entrada' :
                       movement.movement_type === 'exit' ? 'Salida' :
                       movement.movement_type === 'transfer' ? 'Transferencia' :
                       'Ajuste'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {movement.quantity}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${movement.unit_cost?.toLocaleString('es-DO') || '0'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${movement.total_cost?.toLocaleString('es-DO') || '0'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {movement.reference || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {movement.notes || 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredMovements.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">No se encontraron movimientos</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderWarehouseEntriesTab = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-900">Entradas de Almacén</h3>
        <button
          onClick={() => handleOpenModal('warehouse_entry')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          Nueva Entrada
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha doc.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Núm. doc.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Almacén</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Origen</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Emisor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Concepto</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {warehouseEntries.map((entry: any) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entry.document_date ? new Date(entry.document_date).toLocaleDateString('es-DO') : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entry.document_number || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(entry.warehouses && entry.warehouses.name) || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entry.source_type === 'conduce_suplidor'
                      ? 'Conduce suplidor'
                      : entry.source_type === 'devolucion_cliente'
                        ? 'Devolución cliente'
                        : entry.source_type || 'Otros'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entry.issuer_name || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {entry.description || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      entry.status === 'posted'
                        ? 'bg-green-100 text-green-800'
                        : entry.status === 'cancelled'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {entry.status === 'posted'
                        ? 'Posteada'
                        : entry.status === 'cancelled'
                          ? 'Cancelada'
                          : 'Borrador'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {warehouseEntries.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">No se encontraron entradas de almacén</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderWarehouseTransfersTab = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-900">Transferencias entre Almacenes</h3>
        <button
          onClick={() => handleOpenModal('warehouse_transfer')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          Nueva Transferencia
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Núm. doc.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Almacén origen</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Almacén destino</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ítems</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Concepto</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {warehouseTransfers.map((transfer: any) => (
                <tr key={transfer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {transfer.transfer_date
                      ? new Date(transfer.transfer_date).toLocaleDateString('es-DO')
                      : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {transfer.document_number || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(transfer.from_warehouse && transfer.from_warehouse.name) || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(transfer.to_warehouse && transfer.to_warehouse.name) || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {Array.isArray(transfer.warehouse_transfer_lines)
                      ? transfer.warehouse_transfer_lines.length
                      : 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {transfer.description || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        transfer.status === 'posted'
                          ? 'bg-green-100 text-green-800'
                          : transfer.status === 'cancelled'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {transfer.status === 'posted'
                        ? 'Posteada'
                        : transfer.status === 'cancelled'
                          ? 'Cancelada'
                          : 'Borrador'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {warehouseTransfers.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">No se encontraron transferencias de almacén</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderWarehouses = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Gestión de Almacenes</h3>
        <button
          onClick={() => handleOpenModal('warehouse')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          Nuevo Almacén
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {warehouses.map((warehouse) => {
          const stats = getWarehouseStats(warehouse.id);
          return (
            <div key={warehouse.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <i className="ri-building-line text-blue-600"></i>
                </div>
                <h4 className="text-lg font-semibold text-gray-900 ml-3">{warehouse.name}</h4>
              </div>
              <p className="text-sm text-gray-500 mb-2">{warehouse.location}</p>
              <p className="text-xs text-gray-400 mb-4">{warehouse.description}</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Productos:</span>
                  <span className="font-medium">
                    {stats.products}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Stock Total:</span>
                  <span className="font-medium">
                    {stats.stockTotal}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Valor Total:</span>
                  <span className="font-medium text-green-600">
                    ${stats.valueTotal.toLocaleString('es-DO')}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderReports = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Reportes de Inventario</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Reporte de Stock */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <i className="ri-file-list-3-line text-blue-600"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Reporte de Stock</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Reporte detallado de todos los productos con sus niveles de stock actuales.
          </p>
          <button
            onClick={() => navigate('/inventory/reports')}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-download-line mr-2"></i>
            Generar Reporte
          </button>
        </div>

        {/* Toma de Inventario Físico */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <i className="ri-clipboard-line text-indigo-600"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Toma de Inventario Físico</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Listado para conteo físico con espacios para cantidades contadas y observaciones.
          </p>
          <button
            onClick={() => navigate('/inventory/physical-count')}
            className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-download-line mr-2"></i>
            Generar Formato
          </button>
        </div>

        {/* Reporte de Inventario Físico */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <i className="ri-clipboard-check-line text-amber-600"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Reporte de Inventario Físico</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Resultado de la toma física con diferencias de cantidad y valorización por producto.
          </p>
          <button
            onClick={() => navigate('/inventory/physical-result')}
            className="w-full bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-bar-chart-2-line mr-2"></i>
            Ver Reporte
          </button>
        </div>

        {/* Reporte de Movimientos */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <i className="ri-arrow-up-down-line text-green-600"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Reporte de Movimientos</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Historial completo de todos los movimientos de inventario realizados.
          </p>
          <button
            onClick={() => {
              setActiveTab('movements');
              exportToExcel();
            }}
            className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-download-line mr-2"></i>
            Generar Reporte
          </button>
        </div>

        {/* Reporte de Valorización */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <i className="ri-money-dollar-circle-line text-purple-600"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Valorización</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Reporte del valor total del inventario a precios de costo y venta.
          </p>
          <button
            onClick={exportValuationToExcel}
            className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-download-line mr-2"></i>
            Generar Reporte
          </button>
        </div>

        {/* Revalorización de Costos de Inventario */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <i className="ri-slideshow-line text-orange-600"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Revalorización de Costos</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Módulo para ajustar costos promedio ponderados de inventario.
          </p>
          <button
            onClick={() => navigate('/inventory/cost-revaluation')}
            className="w-full bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-bar-chart-box-line mr-2"></i>
            Abrir módulo
          </button>
        </div>

      </div>

      {/* Estadísticas de reportes */}
      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Estadísticas Generales</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Productos Totales</p>
            <p className="text-2xl font-bold text-blue-600">{items.length}</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Categorías</p>
            <p className="text-2xl font-bold text-green-600">{categories.length}</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Movimientos del Mes</p>
            <p className="text-2xl font-bold text-purple-600">
              {movements.filter(m => {
                const movementDate = new Date(m.movement_date);
                const now = new Date();
                return (
                  movementDate.getMonth() === now.getMonth() &&
                  movementDate.getFullYear() === now.getFullYear()
                );
              }).length}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Almacenes</p>
            <p className="text-2xl font-bold text-indigo-600">{warehouses.length}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderModal = () => {
    if (!showModal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {modalType === 'item'
                ? (selectedItem ? 'Editar producto' : 'Nuevo producto')
                : modalType === 'movement'
                  ? 'Movimiento de inventario'
                  : modalType === 'warehouse'
                    ? (selectedItem ? 'Editar almacén' : 'Nuevo almacén')
                    : modalType === 'warehouse_entry'
                      ? 'Entrada de almacén'
                      : modalType === 'warehouse_transfer'
                        ? 'Transferencia de almacén'
                        : 'Gestión de inventario'}
            </h3>
            <button
              type="button"
              onClick={handleCloseModal}
              className="text-gray-400 hover:text-gray-600"
            >
              <i className="ri-close-line text-xl" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {modalType === 'item' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre *
                    </label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SKU *
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.sku || ''}
                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev: any) => ({
                            ...prev,
                            sku: generateSKU(),
                          }))
                        }
                        className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-200 transition-colors whitespace-nowrap text-sm"
                      >
                        Generar
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Categoría
                    </label>
                    <input
                      type="text"
                      value={formData.category || ''}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unidad de medida
                    </label>
                    <input
                      type="text"
                      value={formData.unit_of_measure || ''}
                      onChange={(e) => setFormData({ ...formData, unit_of_measure: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Stock actual
                    </label>
                    <input
                      type="number" min="0"
                      value={formData.current_stock ?? ''}
                      onChange={(e) => setFormData({ ...formData, current_stock: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Almacén
                    </label>
                    <select
                      value={formData.warehouse_id || (warehouses[0]?.id ?? '')}
                      onChange={(e) =>
                        setFormData({ ...formData, warehouse_id: e.target.value || null })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                    >
                      {warehouses.length === 0 && (
                        <option value="">Sin almacenes configurados</option>
                      )}
                      {warehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>
                          {wh.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Stock mínimo
                    </label>
                    <input
                      type="number" min="0"
                      value={formData.minimum_stock ?? ''}
                      onChange={(e) => setFormData({ ...formData, minimum_stock: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Stock máximo
                    </label>
                    <input
                      type="number" min="0"
                      value={formData.maximum_stock ?? ''}
                      onChange={(e) => setFormData({ ...formData, maximum_stock: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Precio de compra (sin impuestos)
                    </label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      value={formData.cost_price ?? ''}
                      onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Precio venta
                    </label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      value={formData.selling_price ?? ''}
                      onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Imagen del producto
                    </label>
                    <div className="flex items-center gap-4">
                      {formData.image_url && (
                        <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={formData.image_url}
                            alt={formData.name || 'Producto'}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 transition-colors text-center"
                        >
                          <i className="ri-upload-cloud-line text-2xl text-gray-400 mb-2 block" />
                          <span className="text-sm text-gray-600">
                            {formData.image_url ? 'Cambiar imagen' : 'Subir imagen'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tipo de ítem
                      </label>
                      <select
                        value={formData.item_type || 'inventory'}
                        onChange={(e) => setFormData({ ...formData, item_type: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      >
                        <option value="inventory">Producto inventariable</option>
                        <option value="service">Servicio</option>
                        <option value="fixed_asset">Activo fijo</option>
                      </select>
                    </div>
                    <div>
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={formData.is_active !== false}
                          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Activo
                      </label>
                    </div>
                    <div>
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={formData.is_commissionable === false}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              is_commissionable: e.target.checked ? false : true,
                            })
                          }
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        No es comisionable
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {formData.item_type === 'inventory' || !formData.item_type ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Cuenta de inventario
                        </label>
                        <select
                          value={formData.inventory_account_id || ''}
                          onChange={(e) =>
                            setFormData({ ...formData, inventory_account_id: e.target.value || null })
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        >
                          <option value="">Seleccionar cuenta</option>
                          {accounts
                            .filter((acc) => {
                              const t = (acc.type || '').toLowerCase();
                              return t === 'asset' || acc.code?.startsWith('1');
                            })
                            .map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.code} - {acc.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Cuenta de ingresos
                        </label>
                        <select
                          value={formData.income_account_id || ''}
                          onChange={(e) =>
                            setFormData({ ...formData, income_account_id: e.target.value || null })
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        >
                          <option value="">Seleccionar cuenta</option>
                          {accounts
                            .filter((acc) => {
                              const t = (acc.type || '').toLowerCase();
                              return t === 'income' || acc.code?.startsWith('4');
                            })
                            .map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.code} - {acc.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Cuenta de costos (COGS)
                        </label>
                        <select
                          value={formData.cogs_account_id || ''}
                          onChange={(e) =>
                            setFormData({ ...formData, cogs_account_id: e.target.value || null })
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        >
                          <option value="">Seleccionar cuenta</option>
                          {accounts
                            .filter((acc) => {
                              const code = String(acc.code || '');
                              const normalized = code.replace(/\./g, '');
                              return normalized.startsWith('5');
                            })
                            .map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.code} - {acc.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </>
                  ) : null}
                  {formData.item_type === 'service' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cuenta de ingresos por servicios
                      </label>
                      <select
                        value={formData.income_account_id || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, income_account_id: e.target.value || null })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      >
                        <option value="">Seleccionar cuenta</option>
                        {accounts
                          .filter((acc) => {
                            const t = (acc.type || '').toLowerCase();
                            return t === 'income' || acc.code?.startsWith('4');
                          })
                          .map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.code} - {acc.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                  {formData.item_type === 'fixed_asset' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cuenta de activo fijo
                      </label>
                      <select
                        value={formData.asset_account_id || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, asset_account_id: e.target.value || null })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      >
                        <option value="">Seleccionar cuenta</option>
                        {accounts
                          .filter((acc) => {
                            const t = (acc.type || '').toLowerCase();
                            return t === 'asset' || acc.code?.startsWith('1');
                          })
                          .map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.code} - {acc.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
              </>
            )}

            {modalType === 'movement' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Producto *
                    </label>
                    <select
                      value={formData.item_id || ''}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        const selected = items.find((it) => String(it.id) === String(selectedId));
                        setFormData({
                          ...formData,
                          item_id: selectedId,
                          unit_cost: selected?.cost_price ?? formData.unit_cost,
                        });
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      required
                    >
                      <option value="">Seleccionar producto</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.sku})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tipo de movimiento *
                    </label>
                    <select
                      value={formData.movement_type || ''}
                      onChange={(e) => setFormData({ ...formData, movement_type: e.target.value, adjustment_direction: 'positive' })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      required
                    >
                      <option value="">Seleccionar tipo</option>
                      <option value="entry">Entrada</option>
                      <option value="exit">Salida</option>
                      <option value="transfer">Transferencia</option>
                      <option value="adjustment">Ajuste</option>
                    </select>
                  </div>
                  {formData.movement_type === 'adjustment' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tipo de ajuste *
                      </label>
                      <select
                        value={formData.adjustment_direction || 'positive'}
                        onChange={(e) => setFormData({ ...formData, adjustment_direction: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        required
                      >
                        <option value="positive">Ajuste positivo (aumento de stock)</option>
                        <option value="negative">Ajuste negativo (disminución/merma)</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cuenta contable (contrapartida)
                    </label>
                    <select
                      value={formData.account_id || ''}
                      onChange={(e) => setFormData({ ...formData, account_id: e.target.value || null })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      required
                    >
                      <option value="">Seleccionar cuenta</option>
                      {accounts
                        .filter((acc) => {
                          const t = (acc.type || '').toLowerCase();
                          return t === 'asset' || acc.code?.startsWith('1');
                        })
                        .map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} - {acc.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cantidad *
                    </label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      value={formData.quantity ?? ''}
                      onChange={(e) =>
                        setFormData({ ...formData, quantity: parseFloat(e.target.value || '0') })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Costo unitario
                    </label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      value={formData.unit_cost ?? ''}
                      readOnly
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha del movimiento *
                    </label>
                    <input
                      type="date"
                      value={formData.movement_date || new Date().toISOString().split('T')[0]}
                      onChange={(e) => setFormData({ ...formData, movement_date: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Referencia
                    </label>
                    <input
                      type="text"
                      value={formData.reference || ''}
                      onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Ej: Factura #123, Orden #456"
                    />
                  </div>
                  <div className="md:col-span-2 lg:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notas
                    </label>
                    <textarea
                      value={formData.notes || ''}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                      placeholder="Información adicional sobre el movimiento"
                    />
                  </div>
                </div>
              </>
            )}

            {modalType === 'warehouse_entry' && (
              <>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Origen de la entrada</label>
                      <select
                        value={formData.source_type || ''}
                        onChange={(e) => setFormData({ ...formData, source_type: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      >
                        <option value="">Seleccione origen</option>
                        <option value="conduce_suplidor">Conduce de suplidor / Orden de compra</option>
                        <option value="devolucion_cliente">Devolución de cliente</option>
                        <option value="otros">Otros</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Almacén que recibe *</label>
                      <select
                        value={formData.warehouse_id || ''}
                        onChange={(e) => setFormData({ ...formData, warehouse_id: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        required
                      >
                        <option value="">Seleccionar almacén</option>
                        {warehouses.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Factura afectada <span className="text-red-500">*</span></label>
                      <select
                        value={formData.related_invoice_id || ''}
                        onChange={(e) => {
                          const value = e.target.value || null;
                          let issuerName = formData.issuer_name || '';
                          let documentNumber = formData.document_number || '';
                          if (value) {
                            const inv = entryInvoices.find((x) => String(x.id) === String(value));
                            const customerName = (inv as any)?.customers?.name as string | undefined;
                            if (customerName) {
                              issuerName = customerName;
                            }
                            const invNumber = String((inv as any)?.invoice_number || '');
                            // Si la factura tiene un número (NCF o interno), usarlo como número de documento
                            if (invNumber) {
                              documentNumber = invNumber;
                            }
                          }
                          setFormData({
                            ...formData,
                            related_invoice_id: value,
                            issuer_name: issuerName,
                            document_number: documentNumber || null,
                          });
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      >
                        <option value="">Sin factura</option>
                        {entryInvoices.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {(inv.invoice_number || inv.id) + (inv.customers?.name ? ` - ${inv.customers.name}` : '')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Conduce afectado</label>
                      <select
                        value={formData.related_delivery_note_id || ''}
                        onChange={(e) => {
                          const value = e.target.value || null;
                          let issuerName = formData.issuer_name || '';
                          if (value) {
                            const dn = entryDeliveryNotes.find((x) => String(x.id) === String(value));
                            const customerName = (dn as any)?.customers?.name as string | undefined;
                            if (customerName) {
                              issuerName = customerName;
                            }
                          }
                          setFormData({
                            ...formData,
                            related_delivery_note_id: value,
                            issuer_name: issuerName,
                          });
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      >
                        <option value="">Sin conduce</option>
                        {entryDeliveryNotes.map((dn) => (
                          <option key={dn.id} value={dn.id}>
                            {(dn.document_number || dn.id) + (dn.customers?.name ? ` - ${dn.customers.name}` : '')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Fecha del documento</label>
                      <input
                        type="date"
                        value={formData.document_date || new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setFormData({ ...formData, document_date: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Número de documento</label>
                      <input
                        type="text"
                        value={formData.document_number || ''}
                        onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Ej: NCF o número de conduce"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del emisor</label>
                      <input
                        type="text"
                        value={formData.issuer_name || ''}
                        onChange={(e) => setFormData({ ...formData, issuer_name: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Nombre del suplidor o cliente"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Concepto de la transacción</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      placeholder="Ej: Devolución de productos, recepción parcial, etc."
                    />
                  </div>

                  <div className="mt-4">
                    <h4 className="text-md font-semibold text-gray-900 mb-2">Líneas de productos</h4>
                    <div className="space-y-3">
                      {warehouseEntryLines.map((line, idx) => (
                        <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Ítem</label>
                            <select
                              value={line.inventory_item_id || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                const selected = items.find((it) => String(it.id) === String(value));
                                const baseCost =
                                  selected && selected.average_cost != null
                                    ? Number(selected.average_cost) || 0
                                    : selected
                                      ? Number(selected.cost_price) || 0
                                      : 0;
                                setWarehouseEntryLines((prev) =>
                                  prev.map((ln, i) =>
                                    i === idx
                                      ? {
                                          ...ln,
                                          inventory_item_id: value,
                                          unit_cost:
                                            baseCost > 0
                                              ? String(baseCost)
                                              : ln.unit_cost,
                                        }
                                      : ln,
                                  ),
                                );
                              }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                            >
                              <option value="">Seleccionar producto</option>
                              {items.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name} ({item.sku})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad</label>
                            <input
                              type="number"
                              step="1"
                              min="0"
                              value={line.quantity}
                              onChange={(e) => {
                                const value = e.target.value;
                                setWarehouseEntryLines((prev) =>
                                  prev.map((ln, i) => (i === idx ? { ...ln, quantity: value } : ln)),
                                );
                              }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Costo unitario</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.unit_cost}
                              readOnly
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
                            <input
                              type="text"
                              value={line.notes || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setWarehouseEntryLines((prev) =>
                                  prev.map((ln, i) => (i === idx ? { ...ln, notes: value } : ln)),
                                );
                              }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setWarehouseEntryLines((prev) => [
                                  ...prev,
                                  { inventory_item_id: '', quantity: '', unit_cost: '', notes: '' },
                                ]);
                              }}
                              className="px-3 py-2 bg-green-100 text-green-700 rounded-lg border border-green-200 hover:bg-green-200 text-xs"
                            >
                              <i className="ri-add-line"></i>
                            </button>
                            {warehouseEntryLines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setWarehouseEntryLines((prev) => prev.filter((_, i) => i !== idx));
                                }}
                                className="px-3 py-2 bg-red-100 text-red-700 rounded-lg border border-red-200 hover:bg-red-200 text-xs"
                              >
                                <i className="ri-delete-bin-line"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {modalType === 'warehouse_transfer' && (
              <>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Almacén origen *</label>
                      <select
                        value={formData.from_warehouse_id || ''}
                        onChange={(e) => setFormData({ ...formData, from_warehouse_id: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        required
                      >
                        <option value="">Seleccionar almacén</option>
                        {warehouses.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Almacén destino *</label>
                      <select
                        value={formData.to_warehouse_id || ''}
                        onChange={(e) => setFormData({ ...formData, to_warehouse_id: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        required
                      >
                        <option value="">Seleccionar almacén</option>
                        {warehouses.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de transferencia <span className="text-red-500">*</span></label>
                      <input
                        type="date"
                        value={formData.transfer_date || new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setFormData({ ...formData, transfer_date: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Número de documento</label>
                      <input
                        type="text"
                        value={formData.document_number || ''}
                        onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Ej: Referencia interna"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descripción / concepto</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      placeholder="Ej: Transferencia entre almacenes"
                    />
                  </div>

                  <div className="mt-4">
                    <h4 className="text-md font-semibold text-gray-900 mb-2">Líneas de productos</h4>
                    <div className="space-y-3">
                      {transferLines.map((line, idx) => {
                        const originId = formData.from_warehouse_id;
                        const originBalances = originId
                          ? warehouseBalances[String(originId)] || {}
                          : {};

                        const availableItems = originId
                          ? items.filter((it) => {
                              if (!it || !it.id) return false;
                              const qty = Number(originBalances[String(it.id)] ?? 0) || 0;
                              return qty > 0;
                            })
                          : items;

                        const selectedItem = availableItems.find(
                          (it) => String(it.id) === String(line.inventory_item_id),
                        );
                        const availableQty = selectedItem
                          ? Number(originBalances[String(selectedItem.id)] ?? 0) || 0
                          : 0;

                        return (
                          <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium text-gray-700 mb-1">Ítem</label>
                              <select
                                value={line.inventory_item_id || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setTransferLines((prev) =>
                                    prev.map((ln, i) => (i === idx ? { ...ln, inventory_item_id: value } : ln)),
                                  );
                                }}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                              >
                                <option value="">Seleccionar producto</option>
                                {availableItems.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name} ({item.sku})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad</label>
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={line.quantity}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setTransferLines((prev) =>
                                    prev.map((ln, i) => (i === idx ? { ...ln, quantity: value } : ln)),
                                  );
                                }}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              {selectedItem && (
                                <p className="mt-1 text-xs text-gray-500">
                                  Disponible en este almacén: {availableQty}
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
                              <input
                                type="text"
                                value={line.notes || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setTransferLines((prev) =>
                                    prev.map((ln, i) => (i === idx ? { ...ln, notes: value } : ln)),
                                  );
                                }}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setTransferLines((prev) => [
                                    ...prev,
                                    { inventory_item_id: '', quantity: '', notes: '' },
                                  ]);
                                }}
                                className="px-3 py-2 bg-green-100 text-green-700 rounded-lg border border-green-200 hover:bg-green-200 text-xs"
                              >
                                <i className="ri-add-line"></i>
                              </button>
                              {transferLines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTransferLines((prev) => prev.filter((_, i) => i !== idx));
                                  }}
                                  className="px-3 py-2 bg-red-100 text-red-700 rounded-lg border border-red-200 hover:bg-red-200 text-xs"
                                >
                                  <i className="ri-delete-bin-line"></i>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}

            {modalType === 'warehouse' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del almacén *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const index = (warehouses?.length || 0) + 1;
                        const suggested = `Almacén ${index}`;
                        setFormData({ ...formData, name: suggested });
                      }}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-200 transition-colors whitespace-nowrap text-sm"
                    >
                      Generar
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ubicación
                  </label>
                  <input
                    type="text"
                    value={formData.location || ''}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Dirección o zona del almacén"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción
                  </label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Descripción del almacén"
                  />
                </div>
              </div>
            )}

            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={handleCloseModal}
                className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors whitespace-nowrap"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                {selectedItem ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="ml-4 text-gray-600">Cargando módulo de inventario...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header con botón de regreso */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium shadow-sm hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            <i className="ri-arrow-left-line text-lg"></i>
            <span>Volver al Inicio</span>
          </button>

          <div className="h-6 w-px bg-gray-300"></div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Inventario</h1>
        </div>
        <button
          onClick={() => navigate('/inventory/delivery-notes')}
          className="flex items-center gap-2 px-4 py-2 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap"
        >
          <i className="ri-truck-line text-lg"></i>
          <span>Conduces</span>
        </button>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: 'ri-dashboard-line' },
            { id: 'products', label: 'Productos', icon: 'ri-box-3-line' },
            { id: 'movements', label: 'Movimientos', icon: 'ri-exchange-line' },
            { id: 'entries', label: 'Entradas', icon: 'ri-download-line' },
            { id: 'transfers', label: 'Transferencias', icon: 'ri-swap-line' },
            { id: 'warehouses', label: 'Almacenes', icon: 'ri-building-line' },
            { id: 'reports', label: 'Reportes', icon: 'ri-file-chart-line' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <i className={tab.icon}></i>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'products' && renderItems()}
        {activeTab === 'movements' && renderMovements()}
        {activeTab === 'entries' && renderWarehouseEntriesTab()}
        {activeTab === 'transfers' && renderWarehouseTransfersTab()}
        {activeTab === 'warehouses' && renderWarehouses()}
        {activeTab === 'reports' && renderReports()}
      </div>

      {/* Modal */}
      {renderModal()}
    </div>
  );
}