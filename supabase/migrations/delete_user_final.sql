-- Script DEFINITIVO para eliminar usuario dcaff998-5435-46f0-b236-24f0e318de94
-- Usa DO block con EXCEPTION para ignorar errores de tablas/columnas inexistentes

 DO $$
 DECLARE
   uid UUID := 'dcaff998-5435-46f0-b236-24f0e318de94';
   stmt text;
 BEGIN
 
   -- Ejecuta SQL ignorando tablas/columnas inexistentes (para que el script no se detenga)
   CREATE TEMP TABLE IF NOT EXISTS __delete_user_tmp_guard(id int) ON COMMIT DROP;
 
   -- helper inline
   -- Nota: usamos un bloque BEGIN/EXCEPTION por sentencia para capturar errores puntuales
 
   -- Notificaciones y logs
   BEGIN EXECUTE format('DELETE FROM public.audit_logs WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.webnoti_notifications WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.data_backups WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   
   -- Referidos
   BEGIN EXECUTE format('DELETE FROM public.referral_clicks WHERE referrer_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.referral_stats WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.referral_withdrawals WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.referral_payouts WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.referral_commissions WHERE referee_user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.referral_purchases WHERE referrer_id = %L OR referred_user_id = %L', uid, uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.referred_users WHERE referrer_id = %L OR referred_user_id = %L', uid, uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.referral_codes WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.user_roles WHERE user_id = %L OR owner_user_id = %L', uid::text, uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

   -- Líneas de documentos AP
   BEGIN EXECUTE format('DELETE FROM public.ap_invoice_lines WHERE ap_invoice_id IN (SELECT id FROM public.ap_invoices WHERE user_id = %L)', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.ap_invoice_notes WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.ap_invoice_payments WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.ap_supplier_advance_applications WHERE advance_id IN (SELECT id FROM public.ap_supplier_advances WHERE user_id = %L)', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   
   -- Líneas de documentos AR
   BEGIN EXECUTE format('DELETE FROM public.quote_lines WHERE quote_id IN (SELECT id FROM public.quotes WHERE user_id = %L)', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.invoice_lines WHERE invoice_id IN (SELECT id FROM public.invoices WHERE user_id = %L)', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.delivery_note_lines WHERE delivery_note_id IN (SELECT id FROM public.delivery_notes WHERE user_id = %L)', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.purchase_order_items WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.receipt_applications WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.receipt_invoices WHERE receipt_id IN (SELECT id FROM public.receipts WHERE user_id = %L)', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   
   -- Líneas de almacén
   BEGIN EXECUTE format('DELETE FROM public.warehouse_entry_lines WHERE entry_id IN (SELECT id FROM public.warehouse_entries WHERE user_id = %L)', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.warehouse_transfer_lines WHERE transfer_id IN (SELECT id FROM public.warehouse_transfers WHERE user_id = %L)', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   
   -- Conciliación y asientos
   BEGIN EXECUTE format('DELETE FROM public.bank_reconciliation_items WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.bank_reconciliation_items WHERE reconciliation_id IN (SELECT id FROM public.bank_reconciliations WHERE user_id = %L)', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM public.journal_entries WHERE user_id = %L)', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Activos fijos
   BEGIN EXECUTE format('DELETE FROM public.fixed_asset_depreciations WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.fixed_asset_disposals WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.fixed_asset_revaluations WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.asset_depreciation WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Pagos de clientes
   BEGIN EXECUTE format('DELETE FROM public.customer_payments WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.credit_debit_notes WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.customer_advances WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.receipts WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Suscripciones
   BEGIN EXECUTE format('UPDATE public.recurring_subscriptions SET last_invoice_id = NULL WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.recurring_subscriptions WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Inventario y almacén
   BEGIN EXECUTE format('DELETE FROM public.inventory_movements WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.warehouse_entries WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.warehouse_transfers WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Documentos principales
   BEGIN EXECUTE format('DELETE FROM public.delivery_notes WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.invoices WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.quotes WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.ap_quote_suppliers WHERE quote_id IN (SELECT id FROM public.ap_quotes WHERE user_id = %L)', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.ap_quotes WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.ap_supplier_advances WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.ap_invoices WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.purchase_orders WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.journal_entries WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.bank_reconciliations WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Transacciones bancarias
   BEGIN EXECUTE format('DELETE FROM public.bank_checks WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.bank_transfers WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.bank_deposits WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.bank_charges WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.bank_credits WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.bank_payment_requests WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Caja chica
   BEGIN EXECUTE format('DELETE FROM public.petty_cash_expenses WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.petty_cash_reimbursements WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.petty_cash_funds WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.petty_cash_categories WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.cash_closings WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Nómina
   BEGIN EXECUTE format('DELETE FROM public.payroll_entries WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.payroll_periods WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.payroll_overtime_records WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.payroll_vacation_requests WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.payroll_royalties WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.payroll_holidays WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.periodic_deductions WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.employee_absences WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.employee_exits WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.salary_changes WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.bonuses WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.complementary_retributions WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.vacations WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.royalties WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.employees WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.positions WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.departments WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.employee_types WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.payroll_employee_types WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.salary_types WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.payroll_salary_types WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.payroll_concepts WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.commission_types WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.payroll_settings WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Reportes fiscales (usando owner_id si existe o user_id)
   BEGIN EXECUTE format('DELETE FROM public.report_606_data WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.report_607_data WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.report_608_data WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.report_ir17_data WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.report_it1_data WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.tax_reports WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.tax_returns WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.fiscal_documents WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.fiscal_deadlines WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.financial_reports WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.financial_statements WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Inventario catálogos
   BEGIN EXECUTE format('DELETE FROM public.inventory_items WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.inventory_categories WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.inventory_brands WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.inventory_units WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.warehouses WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Activos fijos catálogos
   BEGIN EXECUTE format('DELETE FROM public.fixed_assets WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.fixed_asset_types WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.fixed_asset_depreciation_types WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.asset_types WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Clientes y proveedores
   BEGIN EXECUTE format('DELETE FROM public.customers WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.customer_types WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.supplier_payments WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.suppliers WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.supplier_types WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.sales_reps WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.sales_rep_types WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.stores WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.payment_terms WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- NCF y monedas
   BEGIN EXECUTE format('DELETE FROM public.ncf_sequences WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.bank_currencies WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.bank_exchange_rates WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.bank_accounts WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Plan de cuentas (hijos primero)
   BEGIN EXECUTE format('DELETE FROM public.chart_accounts WHERE user_id = %L AND parent_id IS NOT NULL', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.chart_accounts WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Períodos y aprobaciones
   BEGIN EXECUTE format('DELETE FROM public.accounting_periods WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.approval_requests WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Configuraciones
   BEGIN EXECUTE format('DELETE FROM public.accounting_settings WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.tax_configuration WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.tax_settings WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.tax_rates WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.company_info WHERE user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Permisos y roles
   BEGIN EXECUTE format('DELETE FROM public.role_permissions WHERE owner_user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.permissions WHERE owner_user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.roles WHERE owner_user_id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Usuario público
   BEGIN EXECUTE format('DELETE FROM public.profiles WHERE id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
   BEGIN EXECUTE format('DELETE FROM public.users WHERE id = %L', uid); EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  RAISE NOTICE 'Datos públicos del usuario % eliminados', uid;
 END $$;

 -- Eliminar de auth.users
 DO $$
 BEGIN
   BEGIN
     EXECUTE format('DELETE FROM auth.users WHERE id = %L', 'dcaff998-5435-46f0-b236-24f0e318de94');
   EXCEPTION WHEN undefined_table OR undefined_column THEN
     NULL;
   END;
 END $$;
