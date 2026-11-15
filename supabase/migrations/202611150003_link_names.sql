alter table public.availability_links
  add column name text check (char_length(btrim(name)) between 1 and 80);

drop policy links_insert on public.availability_links;
create policy links_insert on public.availability_links for insert to authenticated with check (
  user_id = (select auth.uid())
  and name is not null
  and expires_at > now()
  and expires_at <= now() + interval '366 days'
);
