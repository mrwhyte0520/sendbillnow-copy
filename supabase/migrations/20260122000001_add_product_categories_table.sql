-- Create product_categories table for managing inventory product categories
CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_product_categories_user_id ON public.product_categories(user_id);

-- Create unique constraint on name per user (no duplicate category names for same user)
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_user_name ON public.product_categories(user_id, name);

-- Enable RLS
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only see their own categories
CREATE POLICY "Users can view own categories" ON public.product_categories
  FOR SELECT USING (user_id = auth.uid()::text OR user_id IN (
    SELECT owner_user_id::text FROM public.user_roles WHERE user_id = auth.uid()::text
  ));

-- RLS policy: users can insert their own categories
CREATE POLICY "Users can insert own categories" ON public.product_categories
  FOR INSERT WITH CHECK (user_id = auth.uid()::text OR user_id IN (
    SELECT owner_user_id::text FROM public.user_roles WHERE user_id = auth.uid()::text
  ));

-- RLS policy: users can update their own categories
CREATE POLICY "Users can update own categories" ON public.product_categories
  FOR UPDATE USING (user_id = auth.uid()::text OR user_id IN (
    SELECT owner_user_id::text FROM public.user_roles WHERE user_id = auth.uid()::text
  ));

-- RLS policy: users can delete their own categories
CREATE POLICY "Users can delete own categories" ON public.product_categories
  FOR DELETE USING (user_id = auth.uid()::text OR user_id IN (
    SELECT owner_user_id::text FROM public.user_roles WHERE user_id = auth.uid()::text
  ));

-- Add category_id column to inventory_items if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'inventory_items' 
    AND column_name = 'category_id'
  ) THEN
    ALTER TABLE public.inventory_items ADD COLUMN category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL;
  END IF;
END $$;
