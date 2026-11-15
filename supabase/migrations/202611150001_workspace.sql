create table public.workspaces (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object')
);

create table public.availability_links (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  expires_at timestamptz not null,
  slots jsonb not null check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) <= 62)
);
create index availability_links_owner_expiry on public.availability_links(user_id, expires_at);

alter table public.workspaces enable row level security;
alter table public.availability_links enable row level security;
revoke all on public.workspaces, public.availability_links from public, anon, authenticated;
grant select, insert, update on public.workspaces to authenticated;
grant select, insert, delete on public.availability_links to authenticated;
grant select on public.availability_links to service_role;

create policy workspace_read on public.workspaces for select to authenticated using (user_id = (select auth.uid()));
create policy workspace_insert on public.workspaces for insert to authenticated with check (user_id = (select auth.uid()));
create policy workspace_update on public.workspaces for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy links_read on public.availability_links for select to authenticated using (user_id = (select auth.uid()));
create policy links_insert on public.availability_links for insert to authenticated with check (
  user_id = (select auth.uid()) and expires_at > now() and expires_at <= now() + interval '31 days'
);
create policy links_delete on public.availability_links for delete to authenticated using (user_id = (select auth.uid()));
