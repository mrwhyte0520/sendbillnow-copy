-- Migration to allow same SKU in different warehouses for the same user
-- This enables partial inventory transfers between warehouses

-- Drop the old constraint (user_id, sku)
ALTER TABLE public.inventory_items 
DROP CONSTRAINT IF EXISTS inventory_items_user_id_sku_key;

-- Create new constraint (user_id, warehouse_id, sku)
-- This allows the same SKU to exist in multiple warehouses
ALTER TABLE public.inventory_items 
ADD CONSTRAINT inventory_items_user_id_warehouse_id_sku_key 
UNIQUE (user_id, warehouse_id, sku);
