create index if not exists matcha_favorites_entry_idx
  on public.matcha_favorites (entry_id);

drop policy if exists "Server-only app users" on public.app_users;
create policy "Server-only app users"
  on public.app_users
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "Server-only matcha entries" on public.matcha_entries;
create policy "Server-only matcha entries"
  on public.matcha_entries
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "Server-only matcha favorites" on public.matcha_favorites;
create policy "Server-only matcha favorites"
  on public.matcha_favorites
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
