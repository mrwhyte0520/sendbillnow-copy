-- =====================================================
-- Storage bucket for Service Document signatures
-- Date: 2026-02-04
-- Description: Ensure bucket `service-doc-signatures` exists and is public
-- =====================================================

do $$
begin
  -- Create bucket (id is the bucket name).0
.
  insert into storage.buckets (id, name, public)
  values ('service-doc-signatures', 'service-doc-signatures', false)
  on conflict (id) do update
    set name = excluded.name,
        public = excluded.public;
exception
  when undefined_table then
    -- If storage schema isn't installed in this environment, skip.
    null;
end $$;
