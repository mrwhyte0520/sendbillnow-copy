-- =============================================================================
-- CONTADOR MODULE - Complete Database Schema
-- For Supabase (PostgreSQL) with RLS support
-- Uses user_id for multi-tenant isolation with has_tenant_access() function
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1) STAFF REPORT (Employees / Roles / Attendance)
-- =============================================================================

-- Roles table
CREATE TABLE IF NOT EXISTS contador_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name VARCHAR(60) NOT NULL,
    description TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_contador_roles_user ON contador_roles(user_id);

-- Employees table
CREATE TABLE IF NOT EXISTS contador_employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    employee_no VARCHAR(30) NOT NULL,
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    email VARCHAR(120) NULL,
    phone VARCHAR(30) NULL,
    hire_date DATE NOT NULL,
    termination_date DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated')),
    default_role_id UUID NULL REFERENCES contador_roles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, employee_no)
);

CREATE INDEX IF NOT EXISTS idx_contador_employees_user ON contador_employees(user_id);
CREATE INDEX IF NOT EXISTS idx_contador_employees_status ON contador_employees(user_id, status);
CREATE INDEX IF NOT EXISTS idx_contador_employees_role ON contador_employees(default_role_id);

-- Employee Role History
CREATE TABLE IF NOT EXISTS contador_employee_role_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES contador_employees(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES contador_roles(id) ON DELETE CASCADE,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contador_employee_role_history_employee ON contador_employee_role_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_contador_employee_role_history_dates ON contador_employee_role_history(effective_from, effective_to);

-- Time Clock Entries
CREATE TABLE IF NOT EXISTS contador_time_clock_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES contador_employees(id) ON DELETE CASCADE,
    location_id UUID NULL,
    clock_in TIMESTAMPTZ NOT NULL,
    clock_out TIMESTAMPTZ NULL,
    break_minutes INT NOT NULL DEFAULT 0,
    source VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (source IN ('pos', 'mobile', 'admin', 'kiosk')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contador_time_clock_employee ON contador_time_clock_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_contador_time_clock_dates ON contador_time_clock_entries(user_id, clock_in);

-- =============================================================================
-- 2) CASH & FINANCE (Cash Drawer / Transactions / Expenses)
-- =============================================================================

-- Cash Drawers
CREATE TABLE IF NOT EXISTS contador_cash_drawers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    location_id UUID NULL,
    drawer_name VARCHAR(60) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'closed' CHECK (status IN ('open', 'closed')),
    opened_by UUID NULL REFERENCES contador_employees(id) ON DELETE SET NULL,
    opened_at TIMESTAMPTZ NULL,
    opening_cash NUMERIC(12,2) NULL,
    closed_by UUID NULL REFERENCES contador_employees(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ NULL,
    closing_cash_counted NUMERIC(12,2) NULL,
    closing_cash_expected NUMERIC(12,2) NULL,
    variance NUMERIC(12,2) NULL,
    note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contador_cash_drawers_user ON contador_cash_drawers(user_id);
CREATE INDEX IF NOT EXISTS idx_contador_cash_drawers_status ON contador_cash_drawers(user_id, status);

-- Cash Transactions
CREATE TABLE IF NOT EXISTS contador_cash_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    drawer_id UUID NOT NULL REFERENCES contador_cash_drawers(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL CHECK (type IN ('sale_cash_in', 'cash_drop', 'paid_out_expense', 'refund_cash_out', 'opening_adjustment', 'closing_adjustment')),
    amount NUMERIC(12,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    reference_type VARCHAR(30) NULL,
    reference_id UUID NULL,
    description TEXT NULL,
    created_by UUID NULL REFERENCES contador_employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contador_cash_transactions_drawer ON contador_cash_transactions(drawer_id);
CREATE INDEX IF NOT EXISTS idx_contador_cash_transactions_type ON contador_cash_transactions(user_id, type);
CREATE INDEX IF NOT EXISTS idx_contador_cash_transactions_date ON contador_cash_transactions(user_id, created_at);

-- Expenses
CREATE TABLE IF NOT EXISTS contador_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    location_id UUID NULL,
    expense_date DATE NOT NULL,
    category VARCHAR(60) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'card', 'ach', 'check')),
    vendor_id UUID NULL,
    memo TEXT NULL,
    created_by UUID NULL REFERENCES contador_employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contador_expenses_user ON contador_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_contador_expenses_date ON contador_expenses(user_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_contador_expenses_category ON contador_expenses(user_id, category);

-- =============================================================================
-- 3) PAYROLL (US: FICA, Federal/State withholding)
-- =============================================================================

-- Payroll Runs
CREATE TABLE IF NOT EXISTS contador_payroll_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    pay_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid', 'void')),
    created_by UUID NULL REFERENCES contador_employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by UUID NULL REFERENCES contador_employees(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_contador_payroll_runs_user ON contador_payroll_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_contador_payroll_runs_dates ON contador_payroll_runs(user_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_contador_payroll_runs_status ON contador_payroll_runs(user_id, status);

-- Employee Pay Profiles
CREATE TABLE IF NOT EXISTS contador_employee_pay_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES contador_employees(id) ON DELETE CASCADE,
    pay_type VARCHAR(20) NOT NULL CHECK (pay_type IN ('hourly', 'salary')),
    hourly_rate NUMERIC(12,4) NULL,
    salary_amount NUMERIC(12,2) NULL,
    salary_frequency VARCHAR(20) NULL CHECK (salary_frequency IN ('weekly', 'biweekly', 'semimonthly', 'monthly')),
    federal_filing_status VARCHAR(20) NULL,
    state_code CHAR(2) NULL,
    state_filing_status VARCHAR(20) NULL,
    allowances INT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(employee_id)
);

CREATE INDEX IF NOT EXISTS idx_contador_employee_pay_profiles_employee ON contador_employee_pay_profiles(employee_id);

-- Payroll Items
CREATE TABLE IF NOT EXISTS contador_payroll_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    payroll_run_id UUID NOT NULL REFERENCES contador_payroll_runs(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES contador_employees(id) ON DELETE CASCADE,
    gross_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
    overtime_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
    bonuses NUMERIC(12,2) NOT NULL DEFAULT 0,
    pre_tax_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
    taxes_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    post_tax_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(20) NOT NULL DEFAULT 'check' CHECK (payment_method IN ('ach', 'check', 'cash')),
    paid_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contador_payroll_items_run ON contador_payroll_items(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_contador_payroll_items_employee ON contador_payroll_items(employee_id);

-- Payroll Tax Lines
CREATE TABLE IF NOT EXISTS contador_payroll_tax_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    payroll_item_id UUID NOT NULL REFERENCES contador_payroll_items(id) ON DELETE CASCADE,
    tax_type VARCHAR(30) NOT NULL CHECK (tax_type IN ('federal_withholding', 'state_withholding', 'social_security', 'medicare', 'local_tax', 'futa', 'suta')),
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    employer_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    jurisdiction VARCHAR(60) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contador_payroll_tax_lines_item ON contador_payroll_tax_lines(payroll_item_id);
CREATE INDEX IF NOT EXISTS idx_contador_payroll_tax_lines_type ON contador_payroll_tax_lines(user_id, tax_type);

-- =============================================================================
-- 4) PURCHASES & VENDORS (AP: vendors, bills, payments)
-- =============================================================================

-- Vendors
CREATE TABLE IF NOT EXISTS contador_vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(120) NULL,
    phone VARCHAR(30) NULL,
    address1 VARCHAR(120) NULL,
    address2 VARCHAR(120) NULL,
    city VARCHAR(80) NULL,
    state CHAR(2) NULL,
    zip VARCHAR(15) NULL,
    tax_id VARCHAR(30) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contador_vendors_user ON contador_vendors(user_id);
CREATE INDEX IF NOT EXISTS idx_contador_vendors_status ON contador_vendors(user_id, status);
CREATE INDEX IF NOT EXISTS idx_contador_vendors_name ON contador_vendors(user_id, name);

-- Purchase Orders
CREATE TABLE IF NOT EXISTS contador_purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    po_number VARCHAR(30) NOT NULL,
    vendor_id UUID NOT NULL REFERENCES contador_vendors(id) ON DELETE CASCADE,
    order_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'received', 'cancelled')),
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax NUMERIC(12,2) NOT NULL DEFAULT 0,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_by UUID NULL REFERENCES contador_employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_contador_purchase_orders_user ON contador_purchase_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_contador_purchase_orders_vendor ON contador_purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_contador_purchase_orders_status ON contador_purchase_orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_contador_purchase_orders_date ON contador_purchase_orders(user_id, order_date);

-- Purchase Order Items
CREATE TABLE IF NOT EXISTS contador_purchase_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    purchase_order_id UUID NOT NULL REFERENCES contador_purchase_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    qty NUMERIC(12,3) NOT NULL,
    unit_cost NUMERIC(12,4) NOT NULL,
    line_total NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contador_purchase_order_items_po ON contador_purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_contador_purchase_order_items_product ON contador_purchase_order_items(product_id);

-- Vendor Bills
CREATE TABLE IF NOT EXISTS contador_vendor_bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    vendor_id UUID NOT NULL REFERENCES contador_vendors(id) ON DELETE CASCADE,
    bill_number VARCHAR(40) NOT NULL,
    bill_date DATE NOT NULL,
    due_date DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partially_paid', 'paid', 'void')),
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax NUMERIC(12,2) NOT NULL DEFAULT 0,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    balance_due NUMERIC(12,2) NOT NULL DEFAULT 0,
    memo TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contador_vendor_bills_user ON contador_vendor_bills(user_id);
CREATE INDEX IF NOT EXISTS idx_contador_vendor_bills_vendor ON contador_vendor_bills(vendor_id);
CREATE INDEX IF NOT EXISTS idx_contador_vendor_bills_status ON contador_vendor_bills(user_id, status);
CREATE INDEX IF NOT EXISTS idx_contador_vendor_bills_due ON contador_vendor_bills(user_id, due_date);

-- Vendor Bill Lines
CREATE TABLE IF NOT EXISTS contador_vendor_bill_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    vendor_bill_id UUID NOT NULL REFERENCES contador_vendor_bills(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL DEFAULT 'item' CHECK (type IN ('item', 'expense')),
    product_id UUID NULL,
    expense_category VARCHAR(60) NULL,
    qty NUMERIC(12,3) NULL,
    unit_cost NUMERIC(12,4) NULL,
    amount NUMERIC(12,2) NOT NULL,
    description TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_contador_vendor_bill_lines_bill ON contador_vendor_bill_lines(vendor_bill_id);

-- Vendor Payments
CREATE TABLE IF NOT EXISTS contador_vendor_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    vendor_id UUID NOT NULL REFERENCES contador_vendors(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL,
    method VARCHAR(20) NOT NULL CHECK (method IN ('ach', 'check', 'card', 'cash')),
    amount NUMERIC(12,2) NOT NULL,
    reference_no VARCHAR(60) NULL,
    created_by UUID NULL REFERENCES contador_employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contador_vendor_payments_user ON contador_vendor_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_contador_vendor_payments_vendor ON contador_vendor_payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_contador_vendor_payments_date ON contador_vendor_payments(user_id, payment_date);

-- Vendor Payment Allocations
CREATE TABLE IF NOT EXISTS contador_vendor_payment_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    vendor_payment_id UUID NOT NULL REFERENCES contador_vendor_payments(id) ON DELETE CASCADE,
    vendor_bill_id UUID NOT NULL REFERENCES contador_vendor_bills(id) ON DELETE CASCADE,
    amount_applied NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contador_vendor_payment_allocations_payment ON contador_vendor_payment_allocations(vendor_payment_id);
CREATE INDEX IF NOT EXISTS idx_contador_vendor_payment_allocations_bill ON contador_vendor_payment_allocations(vendor_bill_id);

-- =============================================================================
-- 5) PRODUCTS (Catalog + margins + price history)
-- =============================================================================

-- Products
CREATE TABLE IF NOT EXISTS contador_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    sku VARCHAR(60) NOT NULL,
    name VARCHAR(140) NOT NULL,
    category VARCHAR(80) NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'each',
    cost NUMERIC(12,4) NOT NULL DEFAULT 0,
    price NUMERIC(12,4) NOT NULL DEFAULT 0,
    taxable BOOLEAN NOT NULL DEFAULT true,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_contador_products_user ON contador_products(user_id);
CREATE INDEX IF NOT EXISTS idx_contador_products_status ON contador_products(user_id, status);
CREATE INDEX IF NOT EXISTS idx_contador_products_category ON contador_products(user_id, category);
CREATE INDEX IF NOT EXISTS idx_contador_products_name ON contador_products(user_id, name);

-- Product Price History
CREATE TABLE IF NOT EXISTS contador_product_price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES contador_products(id) ON DELETE CASCADE,
    old_cost NUMERIC(12,4) NULL,
    new_cost NUMERIC(12,4) NULL,
    old_price NUMERIC(12,4) NULL,
    new_price NUMERIC(12,4) NULL,
    changed_by UUID NULL REFERENCES contador_employees(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_contador_product_price_history_product ON contador_product_price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_contador_product_price_history_date ON contador_product_price_history(user_id, changed_at);

-- =============================================================================
-- 6) INVENTORY (Stock, valuation, movements)
-- =============================================================================

-- Inventory Locations
CREATE TABLE IF NOT EXISTS contador_inventory_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name VARCHAR(80) NOT NULL,
    address TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_contador_inventory_locations_user ON contador_inventory_locations(user_id);

-- Inventory Balances
CREATE TABLE IF NOT EXISTS contador_inventory_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    location_id UUID NOT NULL REFERENCES contador_inventory_locations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES contador_products(id) ON DELETE CASCADE,
    qty_on_hand NUMERIC(12,3) NOT NULL DEFAULT 0,
    reorder_level NUMERIC(12,3) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(location_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_contador_inventory_balances_location ON contador_inventory_balances(location_id);
CREATE INDEX IF NOT EXISTS idx_contador_inventory_balances_product ON contador_inventory_balances(product_id);

-- Inventory Movements
CREATE TABLE IF NOT EXISTS contador_inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    location_id UUID NOT NULL REFERENCES contador_inventory_locations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES contador_products(id) ON DELETE CASCADE,
    movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN ('purchase_receive', 'sale_issue', 'return_in', 'vendor_return_out', 'adjustment', 'transfer_in', 'transfer_out')),
    qty NUMERIC(12,3) NOT NULL,
    unit_cost NUMERIC(12,4) NULL,
    reference_type VARCHAR(30) NULL,
    reference_id UUID NULL,
    created_by UUID NULL REFERENCES contador_employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_contador_inventory_movements_location ON contador_inventory_movements(location_id);
CREATE INDEX IF NOT EXISTS idx_contador_inventory_movements_product ON contador_inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_contador_inventory_movements_type ON contador_inventory_movements(user_id, movement_type);
CREATE INDEX IF NOT EXISTS idx_contador_inventory_movements_date ON contador_inventory_movements(user_id, created_at);

-- =============================================================================
-- 7) RETURNS (Customer and Vendor returns)
-- =============================================================================

-- Sales Returns (Customer returns)
CREATE TABLE IF NOT EXISTS contador_sales_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    return_number VARCHAR(40) NOT NULL,
    sale_id UUID NULL,
    customer_id UUID NULL,
    return_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    refund_method VARCHAR(20) NOT NULL CHECK (refund_method IN ('cash', 'card', 'store_credit', 'check')),
    subtotal_refund NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_refund NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_refund NUMERIC(12,2) NOT NULL DEFAULT 0,
    reason TEXT NULL,
    processed_by UUID NULL REFERENCES contador_employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, return_number)
);

CREATE INDEX IF NOT EXISTS idx_contador_sales_returns_user ON contador_sales_returns(user_id);
CREATE INDEX IF NOT EXISTS idx_contador_sales_returns_date ON contador_sales_returns(user_id, return_date);
CREATE INDEX IF NOT EXISTS idx_contador_sales_returns_customer ON contador_sales_returns(customer_id);

-- Sales Return Items
CREATE TABLE IF NOT EXISTS contador_sales_return_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    sales_return_id UUID NOT NULL REFERENCES contador_sales_returns(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES contador_products(id) ON DELETE CASCADE,
    qty NUMERIC(12,3) NOT NULL,
    unit_price NUMERIC(12,4) NOT NULL,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    line_total_refund NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contador_sales_return_items_return ON contador_sales_return_items(sales_return_id);
CREATE INDEX IF NOT EXISTS idx_contador_sales_return_items_product ON contador_sales_return_items(product_id);

-- Vendor Returns
CREATE TABLE IF NOT EXISTS contador_vendor_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    vendor_id UUID NOT NULL REFERENCES contador_vendors(id) ON DELETE CASCADE,
    vendor_return_number VARCHAR(40) NOT NULL,
    return_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'received', 'credited')),
    memo TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, vendor_return_number)
);

CREATE INDEX IF NOT EXISTS idx_contador_vendor_returns_user ON contador_vendor_returns(user_id);
CREATE INDEX IF NOT EXISTS idx_contador_vendor_returns_vendor ON contador_vendor_returns(vendor_id);
CREATE INDEX IF NOT EXISTS idx_contador_vendor_returns_status ON contador_vendor_returns(user_id, status);

-- Vendor Return Items
CREATE TABLE IF NOT EXISTS contador_vendor_return_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    vendor_return_id UUID NOT NULL REFERENCES contador_vendor_returns(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES contador_products(id) ON DELETE CASCADE,
    qty NUMERIC(12,3) NOT NULL,
    unit_cost NUMERIC(12,4) NOT NULL,
    line_total NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contador_vendor_return_items_return ON contador_vendor_return_items(vendor_return_id);
CREATE INDEX IF NOT EXISTS idx_contador_vendor_return_items_product ON contador_vendor_return_items(product_id);

-- =============================================================================
-- 8) FINANCIAL REPORTS (Accounting Periods, Snapshots)
-- =============================================================================

-- Accounting Periods (for Contador module - separate from main accounting_periods)
CREATE TABLE IF NOT EXISTS contador_accounting_periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name VARCHAR(40) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    closed_at TIMESTAMPTZ NULL,
    closed_by UUID NULL REFERENCES contador_employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_contador_accounting_periods_user ON contador_accounting_periods(user_id);
CREATE INDEX IF NOT EXISTS idx_contador_accounting_periods_dates ON contador_accounting_periods(user_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_contador_accounting_periods_status ON contador_accounting_periods(user_id, status);

-- Financial Report Snapshots
CREATE TABLE IF NOT EXISTS contador_financial_report_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    period_id UUID NOT NULL REFERENCES contador_accounting_periods(id) ON DELETE CASCADE,
    report_type VARCHAR(30) NOT NULL CHECK (report_type IN ('pnl', 'balance_sheet', 'cash_flow', 'sales_tax')),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by UUID NULL REFERENCES contador_employees(id) ON DELETE SET NULL,
    filters_json JSONB NULL,
    data_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contador_financial_report_snapshots_period ON contador_financial_report_snapshots(period_id);
CREATE INDEX IF NOT EXISTS idx_contador_financial_report_snapshots_type ON contador_financial_report_snapshots(user_id, report_type);

-- =============================================================================
-- EXTRA: USA Sales Tax (Jurisdictions and Rates)
-- =============================================================================

-- Tax Jurisdictions
CREATE TABLE IF NOT EXISTS contador_tax_jurisdictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    state CHAR(2) NOT NULL,
    county VARCHAR(80) NULL,
    city VARCHAR(80) NULL,
    zip VARCHAR(15) NULL,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, state, county, city, zip)
);

CREATE INDEX IF NOT EXISTS idx_contador_tax_jurisdictions_user ON contador_tax_jurisdictions(user_id);
CREATE INDEX IF NOT EXISTS idx_contador_tax_jurisdictions_state ON contador_tax_jurisdictions(user_id, state);

-- Tax Rates
CREATE TABLE IF NOT EXISTS contador_tax_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    jurisdiction_id UUID NOT NULL REFERENCES contador_tax_jurisdictions(id) ON DELETE CASCADE,
    rate NUMERIC(6,5) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contador_tax_rates_jurisdiction ON contador_tax_rates(jurisdiction_id);
CREATE INDEX IF NOT EXISTS idx_contador_tax_rates_effective ON contador_tax_rates(user_id, effective_from, effective_to);

-- =============================================================================
-- RLS POLICIES (Row Level Security using has_tenant_access)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE contador_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_employee_role_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_time_clock_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_cash_drawers ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_employee_pay_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_payroll_tax_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_vendor_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_vendor_bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_vendor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_vendor_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_product_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_sales_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_vendor_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_vendor_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_financial_report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_tax_jurisdictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contador_tax_rates ENABLE ROW LEVEL SECURITY;

-- RLS Policies using has_tenant_access function
CREATE POLICY "contador_roles_select" ON contador_roles FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_roles_write" ON contador_roles FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_employees_select" ON contador_employees FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_employees_write" ON contador_employees FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_employee_role_history_select" ON contador_employee_role_history FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_employee_role_history_write" ON contador_employee_role_history FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_time_clock_entries_select" ON contador_time_clock_entries FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_time_clock_entries_write" ON contador_time_clock_entries FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_cash_drawers_select" ON contador_cash_drawers FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_cash_drawers_write" ON contador_cash_drawers FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_cash_transactions_select" ON contador_cash_transactions FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_cash_transactions_write" ON contador_cash_transactions FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_expenses_select" ON contador_expenses FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_expenses_write" ON contador_expenses FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_payroll_runs_select" ON contador_payroll_runs FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_payroll_runs_write" ON contador_payroll_runs FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_employee_pay_profiles_select" ON contador_employee_pay_profiles FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_employee_pay_profiles_write" ON contador_employee_pay_profiles FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_payroll_items_select" ON contador_payroll_items FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_payroll_items_write" ON contador_payroll_items FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_payroll_tax_lines_select" ON contador_payroll_tax_lines FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_payroll_tax_lines_write" ON contador_payroll_tax_lines FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_vendors_select" ON contador_vendors FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_vendors_write" ON contador_vendors FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_purchase_orders_select" ON contador_purchase_orders FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_purchase_orders_write" ON contador_purchase_orders FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_purchase_order_items_select" ON contador_purchase_order_items FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_purchase_order_items_write" ON contador_purchase_order_items FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_vendor_bills_select" ON contador_vendor_bills FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_vendor_bills_write" ON contador_vendor_bills FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_vendor_bill_lines_select" ON contador_vendor_bill_lines FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_vendor_bill_lines_write" ON contador_vendor_bill_lines FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_vendor_payments_select" ON contador_vendor_payments FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_vendor_payments_write" ON contador_vendor_payments FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_vendor_payment_allocations_select" ON contador_vendor_payment_allocations FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_vendor_payment_allocations_write" ON contador_vendor_payment_allocations FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_products_select" ON contador_products FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_products_write" ON contador_products FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_product_price_history_select" ON contador_product_price_history FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_product_price_history_write" ON contador_product_price_history FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_inventory_locations_select" ON contador_inventory_locations FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_inventory_locations_write" ON contador_inventory_locations FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_inventory_balances_select" ON contador_inventory_balances FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_inventory_balances_write" ON contador_inventory_balances FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_inventory_movements_select" ON contador_inventory_movements FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_inventory_movements_write" ON contador_inventory_movements FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_sales_returns_select" ON contador_sales_returns FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_sales_returns_write" ON contador_sales_returns FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_sales_return_items_select" ON contador_sales_return_items FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_sales_return_items_write" ON contador_sales_return_items FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_vendor_returns_select" ON contador_vendor_returns FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_vendor_returns_write" ON contador_vendor_returns FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_vendor_return_items_select" ON contador_vendor_return_items FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_vendor_return_items_write" ON contador_vendor_return_items FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_accounting_periods_select" ON contador_accounting_periods FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_accounting_periods_write" ON contador_accounting_periods FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_financial_report_snapshots_select" ON contador_financial_report_snapshots FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_financial_report_snapshots_write" ON contador_financial_report_snapshots FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_tax_jurisdictions_select" ON contador_tax_jurisdictions FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_tax_jurisdictions_write" ON contador_tax_jurisdictions FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "contador_tax_rates_select" ON contador_tax_rates FOR SELECT USING (public.has_tenant_access(user_id));
CREATE POLICY "contador_tax_rates_write" ON contador_tax_rates FOR ALL USING (public.has_tenant_access(user_id)) WITH CHECK (public.has_tenant_access(user_id));

-- =============================================================================
-- TRIGGERS: Auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION contador_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_contador_roles_updated_at BEFORE UPDATE ON contador_roles
    FOR EACH ROW EXECUTE FUNCTION contador_update_updated_at_column();

CREATE TRIGGER update_contador_employees_updated_at BEFORE UPDATE ON contador_employees
    FOR EACH ROW EXECUTE FUNCTION contador_update_updated_at_column();

CREATE TRIGGER update_contador_vendors_updated_at BEFORE UPDATE ON contador_vendors
    FOR EACH ROW EXECUTE FUNCTION contador_update_updated_at_column();

CREATE TRIGGER update_contador_products_updated_at BEFORE UPDATE ON contador_products
    FOR EACH ROW EXECUTE FUNCTION contador_update_updated_at_column();

CREATE TRIGGER update_contador_employee_pay_profiles_updated_at BEFORE UPDATE ON contador_employee_pay_profiles
    FOR EACH ROW EXECUTE FUNCTION contador_update_updated_at_column();

CREATE TRIGGER update_contador_inventory_balances_updated_at BEFORE UPDATE ON contador_inventory_balances
    FOR EACH ROW EXECUTE FUNCTION contador_update_updated_at_column();
