-- Add journal entry number reference to fixed asset depreciations

alter table public.fixed_asset_depreciations
add column if not exists journal_entry_number text;

-- Backfill existing rows using the current convention (one monthly entry)
update public.fixed_asset_depreciations
set journal_entry_number = concat('DEP-', period)
where (journal_entry_number is null or journal_entry_number = '')
  and period is not null
  and period <> '';
