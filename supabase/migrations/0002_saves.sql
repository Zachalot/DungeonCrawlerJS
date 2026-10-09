-- Cloud save slots: one row per account per slot, holding the game's save JSON.
-- Safe to re-run: every statement replaces or skips what already exists.

create table if not exists public.saves (
  user_id    uuid     not null references auth.users (id) on delete cascade,
  slot       smallint not null check (slot between 1 and 3),
  version    int      not null,
  revision   int      not null default 1,
  data       jsonb    not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot),
  constraint save_size check (octet_length(data::text) <= 1048576) -- 1 MB, matching SIZE_WARNING_BYTES
);

alter table public.saves enable row level security;

drop policy if exists "users read their own saves" on public.saves;
create policy "users read their own saves"
  on public.saves for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "users insert their own saves" on public.saves;
create policy "users insert their own saves"
  on public.saves for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "users update their own saves" on public.saves;
create policy "users update their own saves"
  on public.saves for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "users delete their own saves" on public.saves;
create policy "users delete their own saves"
  on public.saves for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.saves from anon, authenticated;
grant select, insert, update, delete on public.saves to authenticated;

-- Compare-and-set write. p_base_revision = 0 means "first save of this slot".
-- Raises 'revision_conflict' if the stored revision isn't the one the client last saw.
create or replace function public.save_slot(p_slot smallint, p_version int, p_data jsonb, p_base_revision int)
returns int
language plpgsql security invoker set search_path = '' as $$
declare
  new_revision int;
begin
  if p_base_revision = 0 then
    insert into public.saves (user_id, slot, version, data)
    values ((select auth.uid()), p_slot, p_version, p_data)
    on conflict do nothing
    returning revision into new_revision;
  else
    update public.saves
       set version = p_version, data = p_data, revision = revision + 1, updated_at = now()
     where user_id = (select auth.uid()) and slot = p_slot and revision = p_base_revision
    returning revision into new_revision;
  end if;

  if new_revision is null then
    raise exception 'revision_conflict' using errcode = 'P0001';
  end if;
  return new_revision;
end $$;

revoke execute on function public.save_slot(smallint, int, jsonb, int) from public, anon;
grant  execute on function public.save_slot(smallint, int, jsonb, int) to authenticated;
