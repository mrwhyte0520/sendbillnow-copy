alter table public.inventory_movements
  add column if not exists adjustment_direction text;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_adjustment_direction_check;

alter table public.inventory_movements
  add constraint inventory_movements_adjustment_direction_check
  check (adjustment_direction is null or adjustment_direction in ('positive', 'negative'));
