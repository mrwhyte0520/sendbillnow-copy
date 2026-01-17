-- =============================================================================
-- Add product types, quantity per type, vendor, and pricing fields to inventory_items
-- Supports: Unit, Box, Mixed Box, Mixed Pallet, Package
-- =============================================================================

-- Add product type field (Unit, Box, Mixed Box, Mixed Pallet, Package)
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'unit';

-- Add quantity per type (e.g., box of 24 units, package of 12, etc.)
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS quantity_per_type integer DEFAULT 1;

-- Add vendor/supplier reference
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.suppliers(id);

-- Add pricing by type
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS box_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pallet_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS package_price numeric DEFAULT 0;

-- Add last entry date for tracking
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS last_entry_date date;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_inventory_items_product_type ON public.inventory_items(product_type);
CREATE INDEX IF NOT EXISTS idx_inventory_items_vendor_id ON public.inventory_items(vendor_id);

-- Add comment to document the product types
COMMENT ON COLUMN public.inventory_items.product_type IS 'Product type: unit, box, mixed_box, mixed_pallet, package';
COMMENT ON COLUMN public.inventory_items.quantity_per_type IS 'Number of units per type (e.g., 24 for a box of 24)';
COMMENT ON COLUMN public.inventory_items.vendor_id IS 'Default vendor/supplier for this product';
COMMENT ON COLUMN public.inventory_items.unit_price IS 'Price per individual unit';
COMMENT ON COLUMN public.inventory_items.box_price IS 'Price per box';
COMMENT ON COLUMN public.inventory_items.pallet_price IS 'Price per pallet';
COMMENT ON COLUMN public.inventory_items.package_price IS 'Price per package';
