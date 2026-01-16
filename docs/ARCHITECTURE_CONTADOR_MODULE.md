# Sendbillnow - System Architecture & Data Flow

## Overview

The system follows a **single source of truth** principle where operational modules create/modify data, and the **Accounting (Contador) module** is a **read-only reporting layer** that consolidates information for accountants.

---

## HYBRID ARCHITECTURE (Implemented)

The Contador module uses a **hybrid architecture**:

### READ FROM CORE (No duplication)
| Contador Service | Reads From Core Table | Purpose |
|-----------------|----------------------|---------|
| `productsService` | `inventory_items` | Product catalog, costs, prices |
| `locationsService` | `warehouses` | Warehouse/location list |
| `balancesService` | `inventory_items` | Stock levels (current_stock) |
| `movementsService` | `inventory_movements` | Stock movement history |
| `vendorsService` | `suppliers` | Vendor/supplier list |
| `purchaseOrdersService` | `purchase_orders` | PO list and details |
| `vendorBillsService` | `ap_invoices` | AP invoices and balances |

### CONTADOR-OWNED TABLES (Write operations allowed)
| Table | Purpose |
|-------|---------|
| `contador_roles` | Employee roles |
| `contador_employees` | Staff records |
| `contador_employee_role_history` | Role change history |
| `contador_time_clock_entries` | Attendance tracking |
| `contador_payroll_runs` | Payroll periods |
| `contador_employee_pay_profiles` | Pay rates and tax setup |
| `contador_payroll_items` | Individual pay records |
| `contador_payroll_tax_lines` | Tax withholdings |
| `contador_cash_drawers` | Cash register management |
| `contador_cash_transactions` | Cash in/out tracking |
| `contador_expenses` | Expense tracking |
| `contador_accounting_periods` | Fiscal period management |
| `contador_financial_report_snapshots` | Report archives |
| `contador_tax_jurisdictions` | Tax jurisdiction setup |
| `contador_tax_rates` | Tax rate history |

### TABLES REMOVED (Were duplicating core)
- ~~`contador_products`~~ → Use `inventory_items`
- ~~`contador_inventory_*`~~ → Use `inventory_items`, `inventory_movements`, `warehouses`
- ~~`contador_vendors`~~ → Use `suppliers`
- ~~`contador_vendor_bills`~~ → Use `ap_invoices`
- ~~`contador_purchase_orders`~~ → Use `purchase_orders`
- ~~`contador_sales_returns`~~ → Use core returns when implemented
- ~~`contador_vendor_returns`~~ → Use core returns when implemented

---

## Module Responsibilities

### 1. Products (Master Catalog)
**Role**: Single source of truth for all sellable/purchasable items.

| Field | Purpose |
|-------|---------|
| `sku` | Unique identifier |
| `name` | Display name |
| `cost` | Purchase cost (for COGS calculation) |
| `price` | Default selling price |
| `taxable` | Whether sales tax applies |
| `tax_category` | Tax classification (standard, reduced, exempt) |
| `type` | physical, service, digital |
| `status` | active, inactive, discontinued |

**Rules**:
- Products table is referenced by all transactional modules
- Price changes create history records for audit
- Never duplicate product data in other tables

---

### 2. Inventory (Stock Control)
**Role**: Track quantity on hand per location/warehouse.

**Tables**:
- `inventory_locations` - Warehouses/stores
- `inventory_balances` - Current qty per product/location
- `inventory_movements` - Audit trail of all changes

**Rules**:
- Balance is ALWAYS calculated from movements (or cached with triggers)
- Every stock change MUST create a movement record
- Supports multiple warehouses (multi-location)

---

### 3. Purchases & Vendors
**Role**: Procurement, receiving goods, accounts payable.

**Flow**:
```
Purchase Order → Receive Goods → Vendor Bill → Payment
     │                │              │           │
     │                ▼              ▼           ▼
     │         +Inventory      +AP Balance   -AP Balance
     │         +Movement       +Expense      +Cash Out
     ▼
  (No inventory effect until received)
```

**Inventory Impact**:
| Action | Inventory Effect | Movement Type |
|--------|-----------------|---------------|
| Create PO | None | - |
| Receive PO | +qty | `purchase_receive` |
| Vendor Return | -qty | `vendor_return_out` |

**Accounting Impact**:
| Action | Accounting Effect |
|--------|-------------------|
| Vendor Bill Created | +Accounts Payable, +Expense/Inventory |
| Payment Made | -Accounts Payable, -Cash |
| Vendor Return Credited | -Accounts Payable |

---

### 4. Billing / POS (Sales)
**Role**: Customer invoicing, point of sale, revenue recognition.

**Flow**:
```
Sale/Invoice → Payment
     │            │
     ▼            ▼
-Inventory    +Cash/AR
+Movement     +Revenue
+Sales Tax
```

**Inventory Impact**:
| Action | Inventory Effect | Movement Type |
|--------|-----------------|---------------|
| Sale Completed | -qty | `sale_issue` |
| Sale Voided | +qty (reversal) | `sale_void_reversal` |

**Accounting Impact**:
| Action | Accounting Effect |
|--------|-------------------|
| Sale Created | +Revenue, +Sales Tax Liability, +AR (if credit) |
| Payment Received | +Cash, -AR |
| Sale Voided | Reverse all above |

---

### 5. Customer Returns
**Role**: Handle returned merchandise, refunds, store credit.

**Flow**:
```
Return Request → Process Return → Refund
      │               │             │
      ▼               ▼             ▼
   (Pending)     +Inventory      -Cash/+Credit
                 +Movement       -Revenue
                                 -Sales Tax
```

**Inventory Impact**:
| Action | Inventory Effect | Movement Type |
|--------|-----------------|---------------|
| Return Processed | +qty | `return_in` |
| Return to Vendor | -qty | `vendor_return_out` |

**Accounting Impact**:
| Action | Accounting Effect |
|--------|-------------------|
| Return Processed | -Revenue, -Sales Tax Liability |
| Refund Issued | -Cash (or +Store Credit Liability) |

---

### 6. Vendor Returns
**Role**: Return goods to suppliers, credit memos.

**Inventory Impact**:
| Action | Inventory Effect | Movement Type |
|--------|-----------------|---------------|
| Return Shipped | -qty | `vendor_return_out` |

**Accounting Impact**:
| Action | Accounting Effect |
|--------|-------------------|
| Credit Received | -Accounts Payable |

---

### 7. Reports (Read-Only)
**Role**: Generate financial statements, analytics, compliance reports.

**CRITICAL**: Reports NEVER modify data. They only SELECT.

**Report Types**:
- Profit & Loss (P&L)
- Balance Sheet
- Cash Flow Statement
- Sales Tax Report (by jurisdiction)
- Inventory Valuation (FIFO/LIFO/Average)
- Accounts Payable Aging
- Accounts Receivable Aging

---

### 8. Accounting / Contador Module
**Role**: Consolidated view for accountants. **READ-ONLY** access to operational data.

**What it provides**:
- Unified dashboard of financial health
- GAAP-compliant report generation
- Sales tax consolidation by state
- Payroll summary & FICA calculations
- Cash flow analysis
- Audit trail access

**What it does NOT do**:
- ❌ Create products
- ❌ Modify inventory
- ❌ Process sales
- ❌ Issue refunds
- ❌ Make payments

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OPERATIONAL LAYER                           │
│                    (Creates & Modifies Data)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌─────────────┐               │
│  │ Products │◄───┤   Billing    │    │  Purchases  │               │
│  │ (Master) │    │    / POS     │    │  & Vendors  │               │
│  └────┬─────┘    └──────┬───────┘    └──────┬──────┘               │
│       │                 │                   │                       │
│       │    ┌────────────┼───────────────────┤                       │
│       │    │            │                   │                       │
│       ▼    ▼            ▼                   ▼                       │
│  ┌─────────────────────────────────────────────────┐               │
│  │              INVENTORY (Single Source)          │               │
│  │  ┌─────────────┐  ┌──────────────────────────┐ │               │
│  │  │  Balances   │◄─┤      Movements           │ │               │
│  │  │ (per loc)   │  │ (audit trail of changes) │ │               │
│  │  └─────────────┘  └──────────────────────────┘ │               │
│  └─────────────────────────────────────────────────┘               │
│       ▲                 ▲                   ▲                       │
│       │                 │                   │                       │
│  ┌────┴────┐      ┌─────┴─────┐      ┌─────┴──────┐                │
│  │Customer │      │  Vendor   │      │ Inventory  │                │
│  │ Returns │      │  Returns  │      │Adjustments │                │
│  └─────────┘      └───────────┘      └────────────┘                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ READ ONLY
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        REPORTING LAYER                              │
│                      (Read-Only Access)                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                 ACCOUNTING / CONTADOR MODULE                 │   │
│  │                                                              │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐ │   │
│  │  │    P&L     │ │  Balance   │ │ Cash Flow  │ │Sales Tax │ │   │
│  │  │  Report    │ │   Sheet    │ │ Statement  │ │  Report  │ │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └──────────┘ │   │
│  │                                                              │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐              │   │
│  │  │  Payroll   │ │    AP      │ │ Inventory  │              │   │
│  │  │  Summary   │ │   Aging    │ │ Valuation  │              │   │
│  │  └────────────┘ └────────────┘ └────────────┘              │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Inventory Movement Types

| Movement Type | Source | Qty Effect | Description |
|--------------|--------|------------|-------------|
| `purchase_receive` | Purchases | +qty | Goods received from vendor |
| `sale_issue` | Billing/POS | -qty | Goods sold to customer |
| `return_in` | Customer Returns | +qty | Customer returned goods |
| `vendor_return_out` | Vendor Returns | -qty | Returned to vendor |
| `adjustment` | Manual | ±qty | Inventory count correction |
| `transfer_in` | Inter-warehouse | +qty | Received from another location |
| `transfer_out` | Inter-warehouse | -qty | Sent to another location |
| `damage_out` | Shrinkage | -qty | Damaged/expired goods |

---

## Accounting Entries Generated

### Sale Transaction
```
Debit:  Cash / Accounts Receivable    $107.00
Credit: Sales Revenue                 $100.00
Credit: Sales Tax Payable             $  7.00
```

### Purchase (Goods Received + Billed)
```
Debit:  Inventory                     $50.00
Credit: Accounts Payable              $50.00
```

### Customer Return (with refund)
```
Debit:  Sales Returns (contra-revenue) $100.00
Debit:  Sales Tax Payable              $  7.00
Credit: Cash                           $107.00

Debit:  Inventory                      $ 50.00
Credit: Cost of Goods Sold             $ 50.00
```

### Vendor Payment
```
Debit:  Accounts Payable              $50.00
Credit: Cash                          $50.00
```

---

## Sales Tax Handling (Multi-State)

### Data Model
```sql
-- Tax jurisdictions (state/county/city combinations)
tax_jurisdictions (
  id, user_id, state, county, city, name
)

-- Tax rates (effective dates for rate changes)
tax_rates (
  id, jurisdiction_id, rate, effective_from, effective_to
)

-- Tax collected per sale
sale_tax_lines (
  id, sale_id, jurisdiction_id, taxable_amount, tax_rate, tax_amount
)
```

### Flow
1. Customer address determines applicable jurisdiction(s)
2. System looks up current rate for each jurisdiction
3. Tax calculated and stored per line item
4. Reports aggregate by state for filing

---

## Multi-Warehouse Support

### Design
- Each `inventory_balance` record is scoped to `(product_id, location_id)`
- Movements always specify source/destination location
- Transfers create paired movements (out from A, in to B)

### Transfer Flow
```
Location A                     Location B
-----------                    -----------
transfer_out (-5 units)   →    transfer_in (+5 units)
reference_id = transfer123     reference_id = transfer123
```

---

## Audit Trail Requirements

### Every Movement Must Record
- `created_at` - Timestamp
- `created_by` - User/employee who performed action
- `reference_type` - What triggered it (sale, purchase, return, manual)
- `reference_id` - Link to source document
- `note` - Optional explanation
- `unit_cost` - Cost at time of movement (for COGS)

### Immutability
- ❌ Never DELETE movements
- ❌ Never UPDATE qty on existing movements
- ✅ Create reversing entries for corrections
- ✅ Void original document and create new one

---

## Best Practices to Avoid Data Duplication

### 1. Single Product Catalog
```
✅ All modules reference products.id
❌ Don't copy product names/prices into transaction tables
   (Store only product_id and price-at-time-of-sale)
```

### 2. Calculated vs Stored
```
✅ Store: Individual transactions, movements
✅ Calculate: Totals, balances, reports
❌ Don't store running totals that can become stale
```

### 3. Denormalization Rules
```
✅ OK to store: price at time of sale (prices change)
✅ OK to store: tax rate at time of sale (rates change)
❌ Don't store: current stock level in products table
❌ Don't store: running AP balance in vendors table
```

### 4. Reference, Don't Copy
```sql
-- ✅ Good: Reference the product
sale_lines (product_id, qty, unit_price)

-- ❌ Bad: Copy product data
sale_lines (product_name, product_sku, qty, unit_price)
```

### 5. One Movement Per Stock Change
```
✅ Sale creates 1 movement per line item
✅ Return creates 1 movement per returned item
❌ Don't create "aggregate" movements
❌ Don't skip movement for "small" transactions
```

---

## GAAP Compliance Checklist

- [x] Revenue recognition on delivery/completion
- [x] COGS matched to revenue period
- [x] Inventory valued consistently (FIFO/LIFO/Average)
- [x] Accrual basis accounting
- [x] Contra-accounts for returns/discounts
- [x] Sales tax liability tracked separately
- [x] Depreciation support (for fixed assets)
- [x] Complete audit trail
- [x] Period closing with no backdating

---

## Summary

| Module | Creates Data | Modifies Inventory | Modifies Accounting |
|--------|-------------|-------------------|---------------------|
| Products | ✅ | ❌ | ❌ |
| Inventory | ✅ (adjustments) | ✅ | ❌ |
| Purchases | ✅ | ✅ (on receive) | ✅ |
| Billing/POS | ✅ | ✅ (on sale) | ✅ |
| Customer Returns | ✅ | ✅ | ✅ |
| Vendor Returns | ✅ | ✅ | ✅ |
| Reports | ❌ | ❌ | ❌ |
| **Accounting/Contador** | ❌ | ❌ | ❌ |

The **Contador module** is purely a **lens** through which accountants view consolidated data from all operational modules. It never creates or modifies operational data.
