-- Script para eliminar usuario dcaff998-5435-46f0-b236-24f0e318de94 y todos sus datos
-- Ejecutar en orden para evitar violaciones de foreign keys

-- Primero ejecutar estos DELETE individualmente para evitar errores de FK

-- Eliminar audit_logs que referencian al usuario
DELETE FROM public.audit_logs WHERE user_id = 'dcaff998-5435-46f0-b236-24f0e318de94';

DO $$
DECLARE
  target_user_id UUID := 'dcaff998-5435-46f0-b236-24f0e318de94';
BEGIN
  -- ========================================
  -- NIVEL 1: Tablas sin dependencias o con dependencias ya eliminadas
  -- ========================================
  
  -- Notificaciones
  DELETE FROM public.webnoti_notifications WHERE user_id = target_user_id;
  
  -- Backups
  DELETE FROM public.data_backups WHERE user_id = target_user_id;
  
  -- Referidos
  DELETE FROM public.referral_clicks WHERE referrer_id = target_user_id;
  DELETE FROM public.referral_stats WHERE user_id = target_user_id;
  DELETE FROM public.referral_withdrawals WHERE user_id = target_user_id;
  DELETE FROM public.referral_payouts WHERE user_id = target_user_id;
  DELETE FROM public.referral_commissions WHERE referee_user_id = target_user_id;
  DELETE FROM public.referral_purchases WHERE referrer_id = target_user_id OR referred_user_id = target_user_id;
  DELETE FROM public.referred_users WHERE referrer_id = target_user_id OR referred_user_id = target_user_id;
  DELETE FROM public.referral_codes WHERE user_id = target_user_id;
  
  -- Roles de usuario
  DELETE FROM public.user_roles WHERE user_id = target_user_id::text OR owner_user_id = target_user_id;
  
  -- ========================================
  -- NIVEL 2: Líneas de documentos (dependen de documentos padre)
  -- ========================================
  
  -- Líneas de facturas AP
  DELETE FROM public.ap_invoice_lines WHERE ap_invoice_id IN (
    SELECT id FROM public.ap_invoices WHERE user_id = target_user_id
  );
  
  -- Notas de facturas AP
  DELETE FROM public.ap_invoice_notes WHERE user_id = target_user_id;
  
  -- Pagos de facturas AP
  DELETE FROM public.ap_invoice_payments WHERE user_id = target_user_id;
  
  -- Aplicaciones de anticipos a proveedores
  DELETE FROM public.ap_supplier_advance_applications WHERE advance_id IN (
    SELECT id FROM public.ap_supplier_advances WHERE user_id = target_user_id
  );
  
  -- Líneas de cotizaciones
  DELETE FROM public.quote_lines WHERE quote_id IN (
    SELECT id FROM public.quotes WHERE user_id = target_user_id
  );
  
  -- Líneas de facturas (invoice_lines)
  DELETE FROM public.invoice_lines WHERE invoice_id IN (
    SELECT id FROM public.invoices WHERE user_id = target_user_id
  );
  
  -- Líneas de notas de entrega
  DELETE FROM public.delivery_note_lines WHERE delivery_note_id IN (
    SELECT id FROM public.delivery_notes WHERE user_id = target_user_id
  );
  
  -- Líneas de órdenes de compra
  DELETE FROM public.purchase_order_items WHERE user_id = target_user_id;
  
  -- Aplicaciones de recibos
  DELETE FROM public.receipt_applications WHERE user_id = target_user_id;
  
  -- Recibos-facturas
  DELETE FROM public.receipt_invoices WHERE receipt_id IN (
    SELECT id FROM public.receipts WHERE user_id = target_user_id
  );
  
  -- Líneas de entradas de almacén
  DELETE FROM public.warehouse_entry_lines WHERE entry_id IN (
    SELECT id FROM public.warehouse_entries WHERE user_id = target_user_id
  );
  
  -- Líneas de transferencias de almacén
  DELETE FROM public.warehouse_transfer_lines WHERE transfer_id IN (
    SELECT id FROM public.warehouse_transfers WHERE user_id = target_user_id
  );
  
  -- Items de conciliación bancaria
  DELETE FROM public.bank_reconciliation_items WHERE user_id = target_user_id OR reconciliation_id IN (
    SELECT id FROM public.bank_reconciliations WHERE user_id = target_user_id
  );
  
  -- Líneas de asientos contables
  DELETE FROM public.journal_entry_lines WHERE entry_id IN (
    SELECT id FROM public.journal_entries WHERE user_id = target_user_id
  );
  
  -- ========================================
  -- NIVEL 3: Documentos principales
  -- ========================================
  
  -- Depreciaciones de activos fijos
  DELETE FROM public.fixed_asset_depreciations WHERE user_id = target_user_id;
  DELETE FROM public.fixed_asset_disposals WHERE user_id = target_user_id;
  DELETE FROM public.fixed_asset_revaluations WHERE user_id = target_user_id;
  DELETE FROM public.asset_depreciation WHERE user_id = target_user_id;
  
  -- Pagos de clientes
  DELETE FROM public.customer_payments WHERE user_id = target_user_id;
  
  -- Notas de crédito/débito
  DELETE FROM public.credit_debit_notes WHERE user_id = target_user_id;
  
  -- Anticipos de clientes
  DELETE FROM public.customer_advances WHERE user_id = target_user_id;
  
  -- Recibos
  DELETE FROM public.receipts WHERE user_id = target_user_id;
  
  -- Suscripciones recurrentes (actualizar last_invoice_id primero)
  UPDATE public.recurring_subscriptions SET last_invoice_id = NULL WHERE user_id = target_user_id;
  
  -- Movimientos de inventario
  DELETE FROM public.inventory_movements WHERE user_id = target_user_id;
  
  -- Entradas de almacén
  DELETE FROM public.warehouse_entries WHERE user_id = target_user_id;
  
  -- Transferencias de almacén
  DELETE FROM public.warehouse_transfers WHERE user_id = target_user_id;
  
  -- Notas de entrega
  DELETE FROM public.delivery_notes WHERE user_id = target_user_id;
  
  -- Facturas (invoices)
  DELETE FROM public.invoices WHERE user_id = target_user_id;
  
  -- Suscripciones recurrentes
  DELETE FROM public.recurring_subscriptions WHERE user_id = target_user_id;
  
  -- Cotizaciones
  DELETE FROM public.quotes WHERE user_id = target_user_id;
  
  -- Cotizaciones AP
  DELETE FROM public.ap_quote_suppliers WHERE quote_id IN (
    SELECT id FROM public.ap_quotes WHERE user_id = target_user_id
  );
  DELETE FROM public.ap_quotes WHERE user_id = target_user_id;
  
  -- Anticipos a proveedores
  DELETE FROM public.ap_supplier_advances WHERE user_id = target_user_id;
  
  -- Facturas AP
  DELETE FROM public.ap_invoices WHERE user_id = target_user_id;
  
  -- Órdenes de compra
  DELETE FROM public.purchase_orders WHERE user_id = target_user_id;
  
  -- Asientos contables
  DELETE FROM public.journal_entries WHERE user_id = target_user_id;
  
  -- Conciliaciones bancarias
  DELETE FROM public.bank_reconciliations WHERE user_id = target_user_id;
  
  -- Transacciones bancarias
  DELETE FROM public.bank_checks WHERE user_id = target_user_id;
  DELETE FROM public.bank_transfers WHERE user_id = target_user_id;
  DELETE FROM public.bank_deposits WHERE user_id = target_user_id;
  DELETE FROM public.bank_charges WHERE user_id = target_user_id;
  DELETE FROM public.bank_credits WHERE user_id = target_user_id;
  DELETE FROM public.bank_payment_requests WHERE user_id = target_user_id;
  
  -- Caja chica
  DELETE FROM public.petty_cash_expenses WHERE user_id = target_user_id;
  DELETE FROM public.petty_cash_reimbursements WHERE user_id = target_user_id;
  DELETE FROM public.petty_cash_funds WHERE user_id = target_user_id;
  DELETE FROM public.petty_cash_categories WHERE user_id = target_user_id;
  
  -- Cierres de caja
  DELETE FROM public.cash_closings WHERE user_id = target_user_id;
  
  -- ========================================
  -- NIVEL 4: Nómina
  -- ========================================
  
  -- Entradas de nómina
  DELETE FROM public.payroll_entries WHERE user_id = target_user_id;
  
  -- Períodos de nómina
  DELETE FROM public.payroll_periods WHERE user_id = target_user_id;
  
  -- Registros de horas extra
  DELETE FROM public.payroll_overtime_records WHERE user_id = target_user_id;
  
  -- Solicitudes de vacaciones
  DELETE FROM public.payroll_vacation_requests WHERE user_id = target_user_id;
  
  -- Regalías de nómina
  DELETE FROM public.payroll_royalties WHERE user_id = target_user_id;
  
  -- Días festivos
  DELETE FROM public.payroll_holidays WHERE user_id = target_user_id;
  
  -- Deducciones periódicas
  DELETE FROM public.periodic_deductions WHERE user_id = target_user_id;
  
  -- Ausencias de empleados
  DELETE FROM public.employee_absences WHERE user_id = target_user_id;
  
  -- Salidas de empleados
  DELETE FROM public.employee_exits WHERE user_id = target_user_id;
  
  -- Cambios de salario
  DELETE FROM public.salary_changes WHERE user_id = target_user_id;
  
  -- Bonos
  DELETE FROM public.bonuses WHERE user_id = target_user_id;
  
  -- Retribuciones complementarias
  DELETE FROM public.complementary_retributions WHERE user_id = target_user_id;
  
  -- Vacaciones
  DELETE FROM public.vacations WHERE user_id = target_user_id;
  
  -- Regalías
  DELETE FROM public.royalties WHERE user_id = target_user_id;
  
  -- Empleados
  DELETE FROM public.employees WHERE user_id = target_user_id;
  
  -- Posiciones
  DELETE FROM public.positions WHERE user_id = target_user_id;
  
  -- Departamentos
  DELETE FROM public.departments WHERE user_id = target_user_id;
  
  -- Tipos de empleado
  DELETE FROM public.employee_types WHERE user_id = target_user_id;
  DELETE FROM public.payroll_employee_types WHERE user_id = target_user_id;
  
  -- Tipos de salario
  DELETE FROM public.salary_types WHERE user_id = target_user_id;
  DELETE FROM public.payroll_salary_types WHERE user_id = target_user_id;
  
  -- Conceptos de nómina
  DELETE FROM public.payroll_concepts WHERE user_id = target_user_id;
  
  -- Tipos de comisión
  DELETE FROM public.commission_types WHERE user_id = target_user_id;
  
  -- Configuración de nómina
  DELETE FROM public.payroll_settings WHERE user_id = target_user_id;
  
  -- ========================================
  -- NIVEL 5: Reportes fiscales
  -- ========================================
  
  DELETE FROM public.formulario_607 WHERE user_id = target_user_id;
  DELETE FROM public.formulario_ir17 WHERE user_id = target_user_id;
  DELETE FROM public.report_606_data WHERE user_id = target_user_id;
  DELETE FROM public.report_607_data WHERE user_id = target_user_id;
  DELETE FROM public.report_608_data WHERE user_id = target_user_id;
  DELETE FROM public.report_ir17_data WHERE user_id = target_user_id;
  DELETE FROM public.report_it1_data WHERE user_id = target_user_id;
  DELETE FROM public.tax_reports WHERE user_id = target_user_id;
  DELETE FROM public.tax_returns WHERE user_id = target_user_id;
  DELETE FROM public.fiscal_documents WHERE user_id = target_user_id;
  DELETE FROM public.fiscal_deadlines WHERE user_id = target_user_id;
  DELETE FROM public.financial_reports WHERE user_id = target_user_id OR generated_by = target_user_id;
  DELETE FROM public.financial_statements WHERE user_id = target_user_id;
  
  -- ========================================
  -- NIVEL 6: Catálogos y configuraciones
  -- ========================================
  
  -- Inventario
  DELETE FROM public.inventory_items WHERE user_id = target_user_id;
  DELETE FROM public.inventory_categories WHERE user_id = target_user_id;
  DELETE FROM public.inventory_brands WHERE user_id = target_user_id;
  DELETE FROM public.inventory_units WHERE user_id = target_user_id;
  
  -- Almacenes
  DELETE FROM public.warehouses WHERE user_id = target_user_id;
  
  -- Activos fijos
  DELETE FROM public.fixed_assets WHERE user_id = target_user_id;
  DELETE FROM public.fixed_asset_types WHERE user_id = target_user_id;
  DELETE FROM public.fixed_asset_depreciation_types WHERE user_id = target_user_id;
  DELETE FROM public.asset_types WHERE user_id = target_user_id;
  
  -- Clientes
  DELETE FROM public.customers WHERE user_id = target_user_id;
  DELETE FROM public.customer_types WHERE user_id = target_user_id;
  
  -- Proveedores
  DELETE FROM public.suppliers WHERE user_id = target_user_id;
  DELETE FROM public.supplier_types WHERE user_id = target_user_id;
  DELETE FROM public.supplier_payments WHERE user_id = target_user_id;
  
  -- Vendedores
  DELETE FROM public.sales_reps WHERE user_id = target_user_id;
  DELETE FROM public.sales_rep_types WHERE user_id = target_user_id;
  
  -- Tiendas
  DELETE FROM public.stores WHERE user_id = target_user_id;
  
  -- Términos de pago
  DELETE FROM public.payment_terms WHERE user_id = target_user_id;
  
  -- Secuencias NCF
  DELETE FROM public.ncf_sequences WHERE user_id = target_user_id;
  
  -- Monedas y tasas de cambio
  DELETE FROM public.bank_currencies WHERE user_id = target_user_id;
  DELETE FROM public.bank_exchange_rates WHERE user_id = target_user_id;
  
  -- Cuentas bancarias
  DELETE FROM public.bank_accounts WHERE user_id = target_user_id;
  
  -- Plan de cuentas (eliminar hijos primero)
  DELETE FROM public.chart_accounts WHERE user_id = target_user_id AND parent_id IS NOT NULL;
  DELETE FROM public.chart_accounts WHERE user_id = target_user_id;
  
  -- Períodos contables
  DELETE FROM public.accounting_periods WHERE user_id = target_user_id OR created_by = target_user_id;
  
  -- Solicitudes de aprobación
  DELETE FROM public.approval_requests WHERE user_id = target_user_id OR approved_by = target_user_id;
  
  -- ========================================
  -- NIVEL 7: Configuraciones del sistema
  -- ========================================
  
  DELETE FROM public.accounting_settings WHERE user_id = target_user_id;
  DELETE FROM public.tax_configuration WHERE user_id = target_user_id;
  DELETE FROM public.tax_settings WHERE user_id = target_user_id;
  DELETE FROM public.tax_rates WHERE user_id = target_user_id;
  DELETE FROM public.company_info WHERE user_id = target_user_id;
  
  -- ========================================
  -- NIVEL 8: Permisos y roles propios
  -- ========================================
  
  DELETE FROM public.role_permissions WHERE owner_user_id = target_user_id;
  DELETE FROM public.permissions WHERE owner_user_id = target_user_id;
  DELETE FROM public.roles WHERE owner_user_id = target_user_id;
  
  -- ========================================
  -- NIVEL 9: Usuario en tabla pública
  -- ========================================
  
  DELETE FROM public.users WHERE id = target_user_id;
  DELETE FROM public.profiles WHERE id = target_user_id;
  
  RAISE NOTICE 'Datos del usuario % eliminados exitosamente', target_user_id;
  
END $$;

-- ========================================
-- NIVEL 10: Eliminar usuario de auth.users
-- (Requiere permisos de superusuario o service_role)
-- ========================================

-- Opción A: Si tienes acceso directo a auth.users
-- DELETE FROM auth.users WHERE id = 'dcaff998-5435-46f0-b236-24f0e318de94';

-- Opción B: Usar la API de Supabase Admin (recomendado)
-- SELECT auth.admin_delete_user('dcaff998-5435-46f0-b236-24f0e318de94');

-- Opción C: Desde el Dashboard de Supabase
-- Ir a Authentication > Users y eliminar manualmente
