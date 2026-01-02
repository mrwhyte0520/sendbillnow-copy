import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { inventoryService, settingsService, chartAccountsService, journalEntriesService, accountingSettingsService, storesService, warehouseEntriesService, warehouseTransfersService, deliveryNotesService, invoicesService, resolveTenantId } from '../../services/database';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { exportToExcelWithHeaders } from '../../utils/exportImportUtils';

// Removed sample data: the view only feeds from the database

export default function InventoryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [items, setItems] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [realSalesTotal, setRealSalesTotal] = useState(0);

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
  const transferNumberRequestRef = useRef(0);

  // Filters and search
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
      // No user: clear data (do not use sample data)
      setItems([]);
      setMovements([]);
      setWarehouseEntries([]);
      setWarehouseTransfers([]);
      setLoading(false);
    }
  }, [user, activeTab]);

  useEffect(() => {
    const loadRealSalesTotal = async () => {
      try {
        if (!user?.id) return;
        if (activeTab !== 'dashboard') return;

        const tenantId = await resolveTenantId(user.id);
        if (!tenantId) {
          setRealSalesTotal(0);
          return;
        }

        // Real sales = sum of invoice lines associated with inventory items (not services)
        const { data, error } = await supabase
          .from('invoice_lines')
          .select(`
            quantity,
            unit_price,
            line_total,
            item_id,
            inventory_items ( item_type ),
            invoices!inner ( user_id )
          `)
          .eq('invoices.user_id', tenantId);

        if (error) throw error;

        const total = (data || [])
          .filter((ln: any) => ln?.item_id && ln?.inventory_items?.item_type !== 'service')
          .reduce((sum: number, ln: any) => {
            const lineTotal = Number(ln?.line_total ?? 0) || 0;
            if (lineTotal) return sum + lineTotal;
            const qty = Number(ln?.quantity ?? 0) || 0;
            const unit = Number(ln?.unit_price ?? 0) || 0;
            return sum + (qty * unit);
          }, 0);

        setRealSalesTotal(total);
      } catch (e) {
        console.error('Error loading real sales total:', e);
        setRealSalesTotal(0);
      }
    };

    loadRealSalesTotal();
  }, [user?.id, activeTab]);

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
      alert('This warehouse has no assigned products.');
      return;
    }

    if (!confirm(`Permanently delete the ${productCount} products from this warehouse? This action cannot be undone.`)) {
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
      alert('Products deleted from warehouse successfully');
    } catch (error) {
      console.error('Error deleting warehouse products:', error);
      alert('Could not delete all products from warehouse');
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
      alert('You cannot delete this warehouse because it has assigned products. Move or delete the products first.');
      return;
    }

    if (!confirm('Delete this warehouse? This action cannot be undone.')) return;

    try {
      await settingsService.deleteWarehouse(warehouse.id);
      await loadWarehouses();
    } catch (error) {
      console.error('Error deleting warehouse:', error);
      alert('Could not delete warehouse');
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
        alert('You must be logged in to upload product images');
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
        alert('Could not upload product image');
        return;
      }

      const { data: publicData } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      const publicUrl = publicData?.publicUrl;
      if (!publicUrl) {
        alert('Could not get public URL for image');
        return;
      }

      setFormData((prev: any) => ({ ...prev, image_url: publicUrl }));
    } catch (error) {
      console.error('handleImageUpload error', error);
      alert('An error occurred while processing the image');
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

    if (!item && type === 'item') {
      // Auto-generate SKU using user's configurable sequence
      if (user?.id) {
        accountingSettingsService.generateNextSku(user.id)
          .then((sku) => {
            setFormData((prev: any) => ({ ...prev, sku }));
          })
          .catch(() => {
            // Fallback if error
            const timestamp = Date.now().toString().slice(-6);
            const random = Math.random().toString(36).substring(2, 5).toUpperCase();
            setFormData((prev: any) => ({ ...prev, sku: `INV-${timestamp}-${random}` }));
          });
      } else {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substring(2, 5).toUpperCase();
        setFormData((prev: any) => ({ ...prev, sku: `INV-${timestamp}-${random}` }));
      }
    }

    setShowModal(true);

    // Pre-fill document number for internal transfers (editable)
    if (!item && type === 'warehouse_transfer' && user?.id) {
      const requestId = Date.now();
      transferNumberRequestRef.current = requestId;

      (async () => {
        try {
          const tenantId = await resolveTenantId(user.id);
          if (!tenantId) return;

          const { data: nextNum, error: nextNumError } = await supabase.rpc(
            'peek_document_number',
            {
              p_tenant_id: tenantId,
              p_doc_key: 'warehouse_transfer',
              p_prefix: 'TRF',
              p_padding: 6,
            },
          );

          if (nextNumError) throw nextNumError;
          if (transferNumberRequestRef.current !== requestId) return;

          if (typeof nextNum === 'string' && nextNum.trim().length > 0) {
            setFormData((prev: any) => {
              const current = typeof prev?.document_number === 'string' ? prev.document_number.trim() : '';
              if (current.length > 0) return prev;
              return { ...prev, document_number: nextNum };
            });
          }
        } catch (err) {
          // If RPC doesn't exist yet or fails, leave editable blank
          console.warn('Could not prefill warehouse transfer document number:', err);
        }
      })();
    }
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
      let skipReloadAfterSave = false;

      if (modalType === 'item') {
        if (user) {
          // Basic numeric validations
          const errors: string[] = [];

          const numCurrent = Number(formData.current_stock);
          const numMin = Number(formData.minimum_stock);
          const numMax = Number(formData.maximum_stock);
          const numCost = Number(formData.cost_price);
          const numSelling = Number(formData.selling_price);

          if (numCurrent < 0) errors.push('Current stock cannot be negative.');
          if (numMin < 0) errors.push('Minimum stock cannot be negative.');
          if (numMax < 0) errors.push('Maximum stock cannot be negative.');
          if (numCost < 0) errors.push('Purchase price cannot be negative.');
          if (numSelling < 0) errors.push('Selling price cannot be negative.');

          if (errors.length > 0) {
            alert(errors.join('\n'));
            return;
          }

          // Validation: maximum stock cannot be less than current stock for inventory products
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
            alert('Maximum stock cannot be less than current stock.');
            return;
          }

          // Normalize numeric fields before saving
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

          // If there's a user, try to save to database
          if (selectedItem) {
            const result = await inventoryService.updateItem(user!.id, selectedItem.id, normalizedItem);

            if (result) {
              setItems((prev) => {
                const next = Array.isArray(prev) ? [...prev] : [];
                const idx = next.findIndex((it: any) => String(it?.id) === String(result?.id));
                if (idx >= 0) next[idx] = { ...next[idx], ...result };
                else next.unshift(result);
                return next;
              });
            }
          } else {
            const created = await inventoryService.createItem(user!.id, {
              ...normalizedItem,
              sku: formData.sku || `SKU${Date.now()}`,
              is_active: formData.is_active !== false
            });

            if (created) {
              setItems((prev) => {
                const next = Array.isArray(prev) ? [...prev] : [];
                next.unshift(created);
                return next;
              });
            }
          }

          // Avoid immediate reload: may bring stale data and overwrite local state
          skipReloadAfterSave = true;
        }
      } else if (modalType === 'movement') {
        if (user) {
          const movementDate = formData.movement_date || new Date().toISOString().split('T')[0];
          const rawQuantity = Number(formData.quantity) || 0;
          const quantity = Number.isFinite(rawQuantity) ? Math.round(rawQuantity) : 0;
          const unitCost = Number(formData.unit_cost) || 0;
          const totalCost = quantity * unitCost;

          // Don't send account_id to inventory_movements table (only used for journal entry)
          const { account_id, warehouse_id: _ignoredWarehouse, ...movementRest } = formData;

          const createdMovement = await inventoryService.createMovement(user!.id, {
            ...movementRest,
            quantity,
            movement_date: movementDate,
            total_cost: totalCost,
          });

          // Update current stock of affected product consistent with the movement
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
                // Adjustments can be positive (increase) or negative (decrease)
                // User indicates if positive or negative with adjustment_direction
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

          // Best-effort: register journal entry for inventory movement
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
                    description: 'Inventory entry',
                    debit_amount: totalCost,
                    credit_amount: 0,
                  },
                  {
                    account_id: counterAccountId,
                    description: 'Inventory entry counterpart',
                    debit_amount: 0,
                    credit_amount: totalCost,
                  },
                );
              } else if (formData.movement_type === 'exit') {
                lines.push(
                  {
                    account_id: counterAccountId,
                    description: 'Inventory exit expense',
                    debit_amount: totalCost,
                    credit_amount: 0,
                  },
                  {
                    account_id: inventoryAccountId,
                    description: 'Inventory exit',
                    debit_amount: 0,
                    credit_amount: totalCost,
                  },
                );
              } else if (formData.movement_type === 'adjustment') {
                // Adjustments can be positive (increase) or negative (decrease)
                const isPositive = formData.adjustment_direction !== 'negative';
                if (isPositive) {
                  // Positive adjustment: debit inventory, credit counterpart
                  lines.push(
                    {
                      account_id: inventoryAccountId,
                      description: 'Inventory adjustment (increase)',
                      debit_amount: totalCost,
                      credit_amount: 0,
                    },
                    {
                      account_id: counterAccountId,
                      description: 'Inventory adjustment counterpart',
                      debit_amount: 0,
                      credit_amount: totalCost,
                    },
                  );
                } else {
                  // Negative adjustment: credit inventory, debit counterpart (expense/loss)
                  lines.push(
                    {
                      account_id: counterAccountId,
                      description: 'Inventory loss/shrinkage',
                      debit_amount: totalCost,
                      credit_amount: 0,
                    },
                    {
                      account_id: inventoryAccountId,
                      description: 'Inventory adjustment (decrease)',
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
                  description: `Inventory movement ${formData.movement_type}`,
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
          alert('You must be logged in to register warehouse entries');
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
          alert('You must add at least one line with valid quantity and selected item');
          return;
        }

        const extraRefs: string[] = [];
        if (formData.related_invoice_id) {
          extraRefs.push(`Related invoice: ${formData.related_invoice_id}`);
        }
        if (formData.related_delivery_note_id) {
          extraRefs.push(`Related delivery note: ${formData.related_delivery_note_id}`);
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
          alert('Warehouse entry registered successfully');
        } catch (err: any) {
          console.error('Error creating warehouse entry:', err);
          alert(`Error registering warehouse entry: ${err?.message || 'check console for more details'}`);
          return;
        }
      } else if (modalType === 'warehouse_transfer') {
        if (!user) {
          alert('You must be logged in to register warehouse transfers');
          return;
        }

        if (!formData.from_warehouse_id || !formData.to_warehouse_id) {
          alert('You must select source and destination warehouses');
          return;
        }
        if (formData.from_warehouse_id === formData.to_warehouse_id) {
          alert('Source and destination warehouses cannot be the same');
          return;
        }

        const validLines = transferLines
          .map((l) => ({
            ...l,
            quantity: Number(l.quantity) || 0,
          }))
          .filter((l) => l.inventory_item_id && l.quantity > 0);

        if (validLines.length === 0) {
          alert('You must add at least one line with valid quantity and selected item');
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
              `${entry.name || 'Product'}: requested ${entry.requested}, available ${entry.available}`,
            );
          }
        });

        if (overRequested.length > 0) {
          alert(
            'Cannot transfer more than available quantity in source warehouse for:\n' +
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
          alert('Warehouse transfer registered successfully');
        } catch (err: any) {
          console.error('Error creating warehouse transfer:', err);
          alert(`Error registering warehouse transfer: ${err?.message || 'check console for more details'}`);
          return;
        }
      }
      
      handleCloseModal();
      if (user && !skipReloadAfterSave) {
        await loadData();
      }
    } catch (error: any) {
      console.error('Error saving data:', error);
      const parts = [
        error?.message ? String(error.message) : null,
        error?.code ? `code: ${String(error.code)}` : null,
        error?.details ? `details: ${String(error.details)}` : null,
        error?.hint ? `hint: ${String(error.hint)}` : null,
      ].filter(Boolean);
      const msg = parts.length > 0 ? parts.join('\n') : 'Check console for more details.';
      alert(`Error saving data:\n${msg}`);
    }
  };

  const handleDelete = async (id: any) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    try {
      if (user) {
        await inventoryService.deleteItem(id);
        loadData();
      }
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Error deleting item. Please try again.');
    }
  };

  const generateSKU = async () => {
    if (user?.id) {
      try {
        const sku = await accountingSettingsService.generateNextSku(user.id);
        setFormData((prev: any) => ({ ...prev, sku }));
        return sku;
      } catch (error) {
        console.error('Error generating SKU:', error);
      }
    }
    // Fallback
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    const fallbackSku = `INV-${timestamp}-${random}`;
    setFormData((prev: any) => ({ ...prev, sku: fallbackSku }));
    return fallbackSku;
  };

  // Export functions
  const exportToExcel = async () => {
    const isItemsTab = activeTab === 'items';
    const dataToExport = isItemsTab ? filteredItems : filteredMovements;

    if (!dataToExport || dataToExport.length === 0) {
      alert('No data to export.');
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
      console.error('Error getting company info for inventory Excel:', error);
    }

    const periodText = `Period: ${new Date().toISOString().slice(0, 7)}`;

    if (isItemsTab) {
      const rows = dataToExport.map((item: any) => ({
        sku: item.sku,
        name: item.name,
        category: item.category || 'N/A',
        current_stock: item.current_stock,
        minimum_stock: item.minimum_stock || 0,
        cost_price: item.cost_price || 0,
        selling_price: item.selling_price || 0,
        status: item.is_active ? 'Active' : 'Inactive',
      }));

      const headers = [
        { key: 'sku', title: 'SKU' },
        { key: 'name', title: 'Name' },
        { key: 'category', title: 'Category' },
        { key: 'current_stock', title: 'Current Stock' },
        { key: 'minimum_stock', title: 'Minimum Stock' },
        { key: 'cost_price', title: 'Cost Price' },
        { key: 'selling_price', title: 'Selling Price' },
        { key: 'status', title: 'Status' },
      ];

      const fileBase = `inventory_products_${new Date().toISOString().split('T')[0]}`;
      const title = 'Inventory Products';

      exportToExcelWithHeaders(rows, headers, fileBase, 'Products', [16, 30, 22, 16, 16, 16, 16, 14], {
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
            ? 'Entry'
            : movement.movement_type === 'exit'
            ? 'Exit'
            : movement.movement_type === 'transfer'
            ? 'Transfer'
            : 'Adjustment',
        quantity: movement.quantity,
        unit_cost: movement.unit_cost || 0,
        total_cost: movement.total_cost || 0,
        reference: movement.reference || 'N/A',
      }));

      const headers = [
        { key: 'movement_date', title: 'Date' },
        { key: 'product_name', title: 'Product' },
        { key: 'type', title: 'Type' },
        { key: 'quantity', title: 'Quantity' },
        { key: 'unit_cost', title: 'Unit Cost' },
        { key: 'total_cost', title: 'Total Cost' },
        { key: 'reference', title: 'Reference' },
      ];

      const fileBase = `inventory_movements_${new Date().toISOString().split('T')[0]}`;
      const title = 'Inventory Movements';

      exportToExcelWithHeaders(rows, headers, fileBase, 'Movements', [16, 30, 18, 14, 18, 18, 26], {
        title,
        companyName,
        headerStyle: 'dgii_606',
        periodText,
      });
    }
  };

  const exportValuationToExcel = async () => {
    if (!items || items.length === 0) {
      alert('No data to generate valuation report.');
      return;
    }

    let companyName = 'ContaBi';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName = (info as any).name || (info as any).company_name || (info as any).legal_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      console.error('Error getting company info for valuation Excel:', error);
    }

    const periodText = `Period: ${new Date().toISOString().slice(0, 7)}`;

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
      { key: 'product', title: 'Product' },
      { key: 'stock', title: 'Stock' },
      { key: 'cost_price', title: 'Cost Price' },
      { key: 'selling_price', title: 'Selling Price' },
      { key: 'value_cost', title: 'Cost Value' },
      { key: 'value_sale', title: 'Sale Value' },
    ];

    const fileBase = `inventory_valuation_${new Date().toISOString().split('T')[0]}`;
    const title = 'Inventory Valuation (Cost and Sale)';

    exportToExcelWithHeaders(rows, headers, fileBase, 'Valuation', [32, 12, 16, 16, 18, 18], {
      title,
      companyName,
      headerStyle: 'dgii_606',
      periodText,
    });
  };

  // Applied filters
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

  // Base: each product contributes its full current_stock to its assigned warehouse
  items.forEach((it: any) => {
    if (!it || !it.id || !it.warehouse_id) return;
    const baseQty = Number(it.current_stock ?? 0) || 0;
    if (!baseQty) return;
    adjustWarehouseBalance(it.warehouse_id, it.id, baseQty);
  });

  // Adjustments: only transfers move stock between warehouses
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
      {/* Main statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="ri-box-3-line text-blue-600"></i>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Products</p>
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
              <p className="text-sm font-medium text-gray-500">Active Products</p>
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
              <p className="text-sm font-medium text-gray-500">Low Stock</p>
              <p className="text-2xl font-semibold text-gray-900">
                {items.filter(item => item.item_type !== 'service' && item.current_stock <= item.minimum_stock).length}
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
              <p className="text-sm font-medium text-gray-500">Movements Today</p>
              <p className="text-2xl font-semibold text-gray-900">
                {movements.filter(m => 
                  new Date(m.movement_date).toDateString() === new Date().toDateString()
                ).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Total inventory value */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Total Cost Value (Average)</p>
            <p className="text-2xl font-bold text-blue-600">
              ${items
                .filter(item => item.item_type !== 'service')
                .reduce((sum, item) => {
                  const cost = item.average_cost ?? item.cost_price ?? 0;
                  return sum + ((item.current_stock || 0) * cost);
                }, 0)
                .toLocaleString('es-DO')}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Total Sale Value</p>
            <p className="text-2xl font-bold text-green-600">
              ${realSalesTotal.toLocaleString('es-DO')}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Potential Profit</p>
            <p className="text-2xl font-bold text-purple-600">
              ${items
                .filter(item => item.item_type !== 'service')
                .reduce((sum, item) => {
                  const cost = item.average_cost ?? item.cost_price ?? 0;
                  return sum + ((item.current_stock || 0) * ((item.selling_price || 0) - cost));
                }, 0)
                .toLocaleString('es-DO')}
            </p>
          </div>
        </div>
      </div>

      {/* Low stock products */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Low Stock Products</h3>
        </div>
        <div className="p-6">
          {items.filter(item => item.item_type !== 'service' && item.current_stock <= item.minimum_stock).length === 0 ? (
            <p className="text-gray-500 text-center py-4">No low stock products</p>
          ) : (
            <div className="space-y-3">
              {items.filter(item => item.item_type !== 'service' && item.current_stock <= item.minimum_stock).slice(0, 5).map(item => (
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
                      Minimum: {item.minimum_stock}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent movements */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Movements</h3>
        </div>
        <div className="p-6">
          {movements.slice(0, 5).length === 0 ? (
            <p className="text-gray-500 text-center py-4">No recent movements</p>
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
                      {movement.movement_type === 'entry' ? 'Entry' :
                       movement.movement_type === 'exit' ? 'Exit' :
                       movement.movement_type === 'transfer' ? 'Transfer' : 'Adjustment'}
                    </span>
                    <p className="text-sm text-gray-500 mt-1">
                      Quantity: {movement.quantity}
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
        <h3 className="text-lg font-semibold text-gray-900">Inventory Products</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportToExcel}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-file-excel-line mr-2"></i>
            Export Excel
          </button>
          <button
            onClick={() => handleOpenModal('item')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2"></i>
            Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or SKU..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
            >
              <option value="">All categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="low_stock">Low Stock</option>
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
              Clear Filters
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sale Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
                        Min: {item.minimum_stock}
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
                        Last purchase: ${item.last_purchase_price.toLocaleString('es-DO')}
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
                      {item.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleOpenModal('item', item)}
                      className="text-blue-600 hover:text-blue-900"
                      title="Edit"
                    >
                      <i className="ri-edit-line"></i>
                    </button>
                    <button
                      onClick={() => handleOpenModal('movement', { item_id: item.id, item_name: item.name })}
                      className="text-green-600 hover:text-green-900"
                      title="New Movement"
                    >
                      <i className="ri-arrow-up-down-line"></i>
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-red-600 hover:text-red-900"
                      title="Delete"
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
              <p className="text-gray-500">No products found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderMovements = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-900">Movements</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportToExcel}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-file-excel-line mr-2"></i>
            Export Excel
          </button>
          <button
            onClick={() => handleOpenModal('movement')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2"></i>
            New Movement
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by product or reference..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Movement Type
            </label>
            <select
              value={movementTypeFilter}
              onChange={(e) => setMovementTypeFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
            >
              <option value="">All types</option>
              <option value="entry">Entry</option>
              <option value="exit">Exit</option>
              <option value="transfer">Transfer</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Type
            </label>
            <select
              value={movementSourceFilter}
              onChange={(e) => setMovementSourceFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
            >
              <option value="">All documents</option>
              <option value="manual">Manual</option>
              <option value="purchase_order">Purchase Order</option>
              <option value="delivery_note">Delivery Note</option>
              <option value="pos_sale">POS Sale</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date Range
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
              Store / Warehouse
            </label>
            <select
              value={movementStoreFilter}
              onChange={(e) => setMovementStoreFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
            >
              <option value="">All stores</option>
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
              <option value="">All warehouses</option>
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
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Cost</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Cost</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
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
                    {movement.movement_type === 'entry' ? 'Entry' :
                     movement.movement_type === 'exit' ? 'Exit' :
                     movement.movement_type === 'transfer' ? 'Transfer' :
                     'Adjustment'}
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
            <p className="text-gray-500">No movements found</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderWarehouseEntriesTab = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-900">Warehouse Entries</h3>
        <button
          onClick={() => handleOpenModal('warehouse_entry')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          New Entry
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doc. Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doc. No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Warehouse</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Issuer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {warehouseEntries.map((entry: any) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(() => {
                      const raw = entry.document_date ? String(entry.document_date) : '';
                      if (!raw) return 'N/A';
                      // Avoid timezone shift: treat YYYY-MM-DD as local date
                      const parts = raw.split('T')[0].split('-');
                      if (parts.length === 3) {
                        const [y, m, d] = parts;
                        return `${d}/${m}/${y}`;
                      }
                      return raw;
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entry.document_number || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(entry.warehouses && entry.warehouses.name) || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entry.source_type === 'conduce_suplidor'
                      ? 'Supplier delivery note'
                      : entry.source_type === 'devolucion_cliente'
                        ? 'Customer return'
                        : entry.source_type === 'ap_invoice'
                          ? 'Supplier invoice'
                        : entry.source_type || 'Other'}
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
                        ? 'Posted'
                        : entry.status === 'cancelled'
                          ? 'Cancelled'
                          : 'Draft'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {warehouseEntries.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">No warehouse entries found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderWarehouseTransfersTab = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-900">Warehouse Transfers</h3>
        <button
          onClick={() => handleOpenModal('warehouse_transfer')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          New Transfer
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doc. No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source Warehouse</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dest. Warehouse</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
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
                        ? 'Posted'
                        : transfer.status === 'cancelled'
                          ? 'Cancelled'
                          : 'Draft'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {warehouseTransfers.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">No warehouse transfers found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderWarehouses = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Warehouse Management</h3>
        <button
          onClick={() => handleOpenModal('warehouse')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          New Warehouse
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
                  <span className="text-gray-500">Products:</span>
                  <span className="font-medium">
                    {stats.products}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Stock:</span>
                  <span className="font-medium">
                    {stats.stockTotal}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Value:</span>
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
        <h3 className="text-lg font-semibold text-gray-900">Inventory Reports</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Stock Report */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <i className="ri-file-list-3-line text-blue-600"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Stock Report</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Detailed report of all products with their current stock levels.
          </p>
          <button
            onClick={() => navigate('/inventory/reports')}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-download-line mr-2"></i>
            Generate Report
          </button>
        </div>

        {/* Physical Inventory Count */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <i className="ri-clipboard-line text-indigo-600"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Physical Inventory Count</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            List for physical count with spaces for counted quantities and observations.
          </p>
          <button
            onClick={() => navigate('/inventory/physical-count')}
            className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-download-line mr-2"></i>
            Generate Format
          </button>
        </div>

        {/* Physical Inventory Report */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <i className="ri-clipboard-check-line text-amber-600"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Physical Inventory Report</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Physical count results with quantity differences and valuation by product.
          </p>
          <button
            onClick={() => navigate('/inventory/physical-result')}
            className="w-full bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-bar-chart-2-line mr-2"></i>
            View Report
          </button>
        </div>

        {/* Movements Report */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <i className="ri-arrow-up-down-line text-green-600"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Movements Report</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Complete history of all inventory movements made.
          </p>
          <button
            onClick={() => {
              setActiveTab('movements');
              exportToExcel();
            }}
            className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-download-line mr-2"></i>
            Generate Report
          </button>
        </div>

        {/* Valuation Report */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <i className="ri-money-dollar-circle-line text-purple-600"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Valuation Report</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Report of total inventory value at cost and sale prices.
          </p>
          <button
            onClick={exportValuationToExcel}
            className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-download-line mr-2"></i>
            Generate Report
          </button>
        </div>

        {/* Cost Revaluation */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <i className="ri-slideshow-line text-orange-600"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Cost Revaluation</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Module to adjust weighted average inventory costs.
          </p>
          <button
            onClick={() => navigate('/inventory/cost-revaluation')}
            className="w-full bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-bar-chart-box-line mr-2"></i>
            Open Module
          </button>
        </div>

      </div>

      {/* General Statistics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">General Statistics</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Total Products</p>
            <p className="text-2xl font-bold text-blue-600">{items.length}</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Categories</p>
            <p className="text-2xl font-bold text-green-600">{categories.length}</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Monthly Movements</p>
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
            <p className="text-sm font-medium text-gray-500">Warehouses</p>
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
                ? (selectedItem ? 'Edit Product' : 'New Product')
                : modalType === 'movement'
                  ? 'Inventory Movement'
                  : modalType === 'warehouse'
                    ? (selectedItem ? 'Edit Warehouse' : 'New Warehouse')
                    : modalType === 'warehouse_entry'
                      ? 'Warehouse Entry'
                      : modalType === 'warehouse_transfer'
                        ? 'Warehouse Transfer'
                        : 'Inventory Management'}
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
                      Name *
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
                        onClick={generateSKU}
                        className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-200 transition-colors whitespace-nowrap text-sm"
                      >
                        Generate
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    <input
                      type="text"
                      list="inventory-categories"
                      value={formData.category || ''}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Type or select a category"
                    />
                    <datalist id="inventory-categories">
                      {categories
                        .filter((c: any) => c != null && String(c).trim() !== '')
                        .map((category: any) => (
                          <option key={String(category)} value={String(category)} />
                        ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unit of Measure
                    </label>
                    <input
                      type="text"
                      list="unit-of-measure-options"
                      value={formData.unit_of_measure || ''}
                      onChange={(e) => setFormData({ ...formData, unit_of_measure: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Select or type unit"
                    />
                    <datalist id="unit-of-measure-options">
                      <option value="Unit" />
                      <option value="Piece" />
                      <option value="Box" />
                      <option value="Pack" />
                      <option value="Dozen" />
                      <option value="Pair" />
                      <option value="Kg" />
                      <option value="Gram" />
                      <option value="Pound" />
                      <option value="Ounce" />
                      <option value="Liter" />
                      <option value="Gallon" />
                      <option value="Meter" />
                      <option value="Foot" />
                      <option value="Inch" />
                      <option value="Square meter" />
                      <option value="Square foot" />
                      <option value="Roll" />
                      <option value="Bag" />
                      <option value="Bottle" />
                      <option value="Can" />
                      <option value="Barrel" />
                      <option value="Sack" />
                      <option value="Service" />
                      <option value="Hour" />
                      {/* Add existing custom units */}
                      {Array.from(new Set(items.map((it: any) => it.unit_of_measure).filter((u: any) => u && String(u).trim() !== '')))
                        .filter((u: any) => !['Unit', 'Piece', 'Box', 'Pack', 'Dozen', 'Pair', 'Kg', 'Gram', 'Pound', 'Ounce', 'Liter', 'Gallon', 'Meter', 'Foot', 'Inch', 'Square meter', 'Square foot', 'Roll', 'Bag', 'Bottle', 'Can', 'Barrel', 'Sack', 'Service', 'Hour'].includes(u))
                        .map((unit: any) => (
                          <option key={String(unit)} value={String(unit)} />
                        ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Current Stock
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
                      Warehouse
                    </label>
                    <select
                      value={formData.warehouse_id || (warehouses[0]?.id ?? '')}
                      onChange={(e) =>
                        setFormData({ ...formData, warehouse_id: e.target.value || null })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                    >
                      {warehouses.length === 0 && (
                        <option value="">No warehouses configured</option>
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
                      Minimum Stock
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
                      Maximum Stock
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
                      Purchase Price (before tax)
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
                      Sale Price
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
                      Product Image
                    </label>
                    <div className="flex items-center gap-4">
                      {formData.image_url && (
                        <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={formData.image_url}
                            alt={formData.name || 'Product'}
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
                            {formData.image_url ? 'Change image' : 'Upload image'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Item Type
                      </label>
                      <select
                        value={formData.item_type || 'inventory'}
                        onChange={(e) => setFormData({ ...formData, item_type: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      >
                        <option value="inventory">Inventory product</option>
                        <option value="service">Service</option>
                        <option value="fixed_asset">Fixed asset</option>
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
                        Active
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
                        Not commissionable
                      </label>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4 mt-4">
                  <h4 className="text-md font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <i className="ri-file-list-3-line text-blue-600"></i>
                    Accounting Accounts
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {formData.item_type === 'inventory' || !formData.item_type ? (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Inventory Account
                          </label>
                          <select
                            value={formData.inventory_account_id || ''}
                            onChange={(e) =>
                              setFormData({ ...formData, inventory_account_id: e.target.value || null })
                            }
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                          >
                            <option value="">Select account</option>
                            {accounts
                              .filter((acc) => {
                                const code = String(acc.code || '').replace(/\./g, '');
                                // Asset accounts: 1xxx (for inventory)
                                return code.startsWith('1');
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
                            Income Account
                          </label>
                          <select
                            value={formData.income_account_id || ''}
                            onChange={(e) =>
                              setFormData({ ...formData, income_account_id: e.target.value || null })
                            }
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                          >
                            <option value="">Select account</option>
                            {accounts
                              .filter((acc) => {
                                const code = String(acc.code || '').replace(/\./g, '');
                                // Income accounts: 4xxx
                                return code.startsWith('4');
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
                            Cost and Expense Account
                          </label>
                          <select
                            value={formData.cogs_account_id || ''}
                            onChange={(e) =>
                              setFormData({ ...formData, cogs_account_id: e.target.value || null })
                            }
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                          >
                            <option value="">Select account</option>
                            {accounts
                              .filter((acc) => {
                                const code = String(acc.code || '');
                                const normalized = code.replace(/\./g, '');
                                return normalized.startsWith('5') || normalized.startsWith('6');
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
                          Service Income Account
                        </label>
                        <select
                          value={formData.income_account_id || ''}
                          onChange={(e) =>
                            setFormData({ ...formData, income_account_id: e.target.value || null })
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        >
                          <option value="">Select account</option>
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
                          Fixed Asset Account
                        </label>
                        <select
                          value={formData.asset_account_id || ''}
                          onChange={(e) =>
                            setFormData({ ...formData, asset_account_id: e.target.value || null })
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        >
                          <option value="">Select account</option>
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
                </div>
              </>
            )}

            {modalType === 'movement' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Product *
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
                      <option value="">Select product</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.sku})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Movement Type *
                    </label>
                    <select
                      value={formData.movement_type || ''}
                      onChange={(e) => setFormData({ ...formData, movement_type: e.target.value, adjustment_direction: 'positive' })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      required
                    >
                      <option value="">Select type</option>
                      <option value="entry">Entry</option>
                      <option value="exit">Exit</option>
                      <option value="transfer">Transfer</option>
                      <option value="adjustment">Adjustment</option>
                    </select>
                  </div>
                  {formData.movement_type === 'adjustment' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Adjustment Type *
                      </label>
                      <select
                        value={formData.adjustment_direction || 'positive'}
                        onChange={(e) => setFormData({ ...formData, adjustment_direction: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        required
                      >
                        <option value="positive">Positive adjustment (stock increase)</option>
                        <option value="negative">Negative adjustment (decrease/shrinkage)</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Accounting Account (offset)
                    </label>
                    <select
                      value={formData.account_id || ''}
                      onChange={(e) => setFormData({ ...formData, account_id: e.target.value || null })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      required
                    >
                      <option value="">Select account</option>
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
                      Quantity *
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
                      Unit Cost
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
                      Movement Date *
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
                      Reference
                    </label>
                    <input
                      type="text"
                      value={formData.reference || ''}
                      onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="E.g.: Invoice #123, Order #456"
                    />
                  </div>
                  <div className="md:col-span-2 lg:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={formData.notes || ''}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                      placeholder="Additional information about the movement"
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Entry Source</label>
                      <select
                        value={formData.source_type || ''}
                        onChange={(e) => setFormData({ ...formData, source_type: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      >
                        <option value="">Select source</option>
                        <option value="conduce_suplidor">Supplier delivery note / Purchase order</option>
                        <option value="devolucion_cliente">Customer return</option>
                        <option value="otros">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Receiving Warehouse *</label>
                      <select
                        value={formData.warehouse_id || ''}
                        onChange={(e) => setFormData({ ...formData, warehouse_id: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        required
                      >
                        <option value="">Select warehouse</option>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Related Invoice <span className="text-red-500">*</span></label>
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
                            // If the invoice has a number (NCF or internal), use it as document number
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
                        <option value="">No invoice</option>
                        {entryInvoices.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {(inv.invoice_number || inv.id) + (inv.customers?.name ? ` - ${inv.customers.name}` : '')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Related Delivery Note</label>
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
                        <option value="">No delivery note</option>
                        {entryDeliveryNotes.map((dn) => (
                          <option key={dn.id} value={dn.id}>
                            {(dn.document_number || dn.id) + (dn.customers?.name ? ` - ${dn.customers.name}` : '')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Document Date</label>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Document Number</label>
                      <input
                        type="text"
                        value={formData.document_number || ''}
                        onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="E.g.: NCF or delivery note number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Issuer Name</label>
                      <input
                        type="text"
                        value={formData.issuer_name || ''}
                        onChange={(e) => setFormData({ ...formData, issuer_name: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Supplier or customer name"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Description</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      placeholder="E.g.: Product return, partial receipt, etc."
                    />
                  </div>

                  <div className="mt-4">
                    <h4 className="text-md font-semibold text-gray-900 mb-2">Product Lines</h4>
                    <div className="space-y-3">
                      {warehouseEntryLines.map((line, idx) => (
                        <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Item</label>
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
                              <option value="">Select product</option>
                              {items.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name} ({item.sku})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
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
                            <label className="block text-xs font-medium text-gray-700 mb-1">Unit Cost</label>
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
                            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Source Warehouse *</label>
                      <select
                        value={formData.from_warehouse_id || ''}
                        onChange={(e) => setFormData({ ...formData, from_warehouse_id: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        required
                      >
                        <option value="">Select warehouse</option>
                        {warehouses.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Destination Warehouse *</label>
                      <select
                        value={formData.to_warehouse_id || ''}
                        onChange={(e) => setFormData({ ...formData, to_warehouse_id: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        required
                      >
                        <option value="">Select warehouse</option>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Date *</label>
                      <input
                        type="date"
                        value={formData.transfer_date || new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setFormData({ ...formData, transfer_date: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Document Number</label>
                      <input
                        type="text"
                        value={formData.document_number || ''}
                        onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="E.g.: Internal reference"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description / Concept</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      placeholder="E.g.: Transfer between warehouses"
                    />
                  </div>

                  <div className="mt-4">
                    <h4 className="text-md font-semibold text-gray-900 mb-2">Product Lines</h4>
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
                              <label className="block text-xs font-medium text-gray-700 mb-1">Item</label>
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
                                <option value="">Select product</option>
                                {availableItems.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name} ({item.sku})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
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
                                  Available in this warehouse: {availableQty}
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
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
                    Warehouse Name *
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
                        const suggested = `Warehouse ${index}`;
                        setFormData({ ...formData, name: suggested });
                      }}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-200 transition-colors whitespace-nowrap text-sm"
                    >
                      Generate
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={formData.location || ''}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Address or warehouse zone"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Warehouse description"
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
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                {selectedItem ? 'Update' : 'Create'}
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
        <p className="ml-4 text-gray-600">Loading inventory module...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header with back button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium shadow-sm hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            <i className="ri-arrow-left-line text-lg"></i>
            <span>Back to Home</span>
          </button>

          <div className="h-6 w-px bg-gray-300"></div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
        </div>
        <button
          onClick={() => navigate('/inventory/delivery-notes')}
          className="flex items-center gap-2 px-4 py-2 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap"
        >
          <i className="ri-truck-line text-lg"></i>
          <span>Delivery Notes</span>
        </button>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: 'ri-dashboard-line' },
            { id: 'products', label: 'Products', icon: 'ri-box-3-line' },
            { id: 'movements', label: 'Movements', icon: 'ri-exchange-line' },
            { id: 'entries', label: 'Entries', icon: 'ri-download-line' },
            { id: 'transfers', label: 'Transfers', icon: 'ri-swap-line' },
            { id: 'warehouses', label: 'Warehouses', icon: 'ri-building-line' },
            { id: 'reports', label: 'Reports', icon: 'ri-file-chart-line' }
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