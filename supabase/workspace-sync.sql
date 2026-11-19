-- Apply after the existing migrations. Existing account data is preserved.
alter table public.workspaces
  add column if not exists revision bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.agenda_workspace_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

create or replace trigger workspace_revision
before update on public.workspaces
for each row execute function public.agenda_workspace_revision();

-- Clients may update the contents, but cannot change account ownership or versions.
revoke insert, update on public.workspaces from authenticated;
grant insert (user_id, data), update (data) on public.workspaces to authenticated;
revoke all on function public.agenda_workspace_revision() from public, anon, authenticated;
