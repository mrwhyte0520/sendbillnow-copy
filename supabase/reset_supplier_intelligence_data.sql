BEGIN;

DELETE FROM public.supplier_catalog_price_history;
DELETE FROM public.supplier_catalog_sync_schedules;
DELETE FROM public.supplier_catalog_products;

COMMIT;
