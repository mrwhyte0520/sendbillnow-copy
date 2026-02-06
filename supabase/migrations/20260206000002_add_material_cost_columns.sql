-- Add material_cost to service_documents
ALTER TABLE public.service_documents
  ADD COLUMN IF NOT EXISTS material_cost numeric(12,2) NOT NULL DEFAULT 0;

-- Add unit_cost to service_document_lines (tracks cost price from inventory)
ALTER TABLE public.service_document_lines
  ADD COLUMN IF NOT EXISTS unit_cost numeric(12,2) NOT NULL DEFAULT 0;
