-- =============================================================================
-- CONTADOR MODULE - Hybrid Refactor Migration
-- Removes duplicate tables that exist in core system
-- Contador becomes READ-ONLY for operational data (Products, Inventory, Vendors, Sales)
-- Contador keeps its own tables ONLY for: Staff/Payroll, Cash, Tax, Accounting Periods
-- =============================================================================

-- =============================================================================
-- DROP DUPLICATE TABLES (data exists in core system)
-- =============================================================================

-- Drop Returns tables (use core returns system)
DROP TABLE IF EXISTS contador_vendor_return_items CASCADE;
DROP TABLE IF EXISTS contador_vendor_returns CASCADE;
DROP TABLE IF EXISTS contador_sales_return_items CASCADE;
DROP TABLE IF EXISTS contador_sales_returns CASCADE;

-- Drop Inventory tables (use core inventory_items, inventory_movements, warehouses)
DROP TABLE IF EXISTS contador_inventory_movements CASCADE;
DROP TABLE IF EXISTS contador_inventory_balances CASCADE;
DROP TABLE IF EXISTS contador_inventory_locations CASCADE;

-- Drop Products tables (use core inventory_items)
DROP TABLE IF EXISTS contador_product_price_history CASCADE;
DROP TABLE IF EXISTS contador_products CASCADE;

-- Drop Vendor/AP tables (use core suppliers, ap_invoices, purchase_orders)
DROP TABLE IF EXISTS contador_vendor_payment_allocations CASCADE;
DROP TABLE IF EXISTS contador_vendor_payments CASCADE;
DROP TABLE IF EXISTS contador_vendor_bill_lines CASCADE;
DROP TABLE IF EXISTS contador_vendor_bills CASCADE;
DROP TABLE IF EXISTS contador_purchase_order_items CASCADE;
DROP TABLE IF EXISTS contador_purchase_orders CASCADE;
DROP TABLE IF EXISTS contador_vendors CASCADE;

-- Drop triggers for removed tables
DROP TRIGGER IF EXISTS update_contador_vendors_updated_at ON contador_vendors;
DROP TRIGGER IF EXISTS update_contador_products_updated_at ON contador_products;
DROP TRIGGER IF EXISTS update_contador_inventory_balances_updated_at ON contador_inventory_balances;

-- =============================================================================
-- TABLES RETAINED (Contador-specific functionality)
-- =============================================================================
-- The following tables are KEPT because they are specific to the Contador module
-- and do not duplicate core system functionality:
--
-- STAFF & PAYROLL:
--   - contador_roles
--   - contador_employees
--   - contador_employee_role_history
--   - contador_time_clock_entries
--   - contador_payroll_runs
--   - contador_employee_pay_profiles
--   - contador_payroll_items
--   - contador_payroll_tax_lines
--
-- CASH MANAGEMENT:
--   - contador_cash_drawers
--   - contador_cash_transactions
--   - contador_expenses
--
-- ACCOUNTING & TAX:
--   - contador_accounting_periods
--   - contador_financial_report_snapshots
--   - contador_tax_jurisdictions
--   - contador_tax_rates
-- =============================================================================

-- =============================================================================
-- CORE TABLE MAPPINGS (for reference)
-- =============================================================================
-- Contador Module         →  Core System Table
-- ---------------------      ------------------
-- contador_products       →  inventory_items
-- contador_inventory_*    →  inventory_items, inventory_movements, warehouses
-- contador_vendors        →  suppliers
-- contador_vendor_bills   →  ap_invoices
-- contador_purchase_orders→  purchase_orders
-- contador_sales_returns  →  (core returns system)
-- contador_vendor_returns →  (core returns system)
-- =============================================================================

-- Add comment to document the hybrid architecture
COMMENT ON SCHEMA public IS 'Sendbillnow: Contador module uses hybrid architecture - reads from core tables for Products/Inventory/Vendors/Sales, maintains own tables for Staff/Payroll/Cash/Tax';
