create table public.appointment_proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  sender_id uuid not null references auth.users on delete cascade,
  sender_label text not null,
  day date not null,
  starts time not null,
  ends time not null,
  message text not null default '',
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  check (owner_id <> sender_id and ends > starts)
);
create index proposals_owner on public.appointment_proposals(owner_id, created_at desc);
create index proposals_sender on public.appointment_proposals(sender_id, created_at desc);
alter table public.appointment_proposals enable row level security;
revoke all on public.appointment_proposals from public, anon, authenticated;
grant select, insert, update on public.appointment_proposals to service_role;

create function public.agenda_propose(actor uuid, label text, share_token uuid, requested_day date,
  requested_start time, requested_end time, note text)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  shared public.availability_links%rowtype;
  day_slots jsonb;
begin
  select * into shared from public.availability_links where token = share_token and expires_at > now();
  if not found or shared.user_id = actor then return 'unavailable'; end if;
  select entry->'slots' into day_slots from jsonb_array_elements(shared.slots) entry
    where entry->>'day' = requested_day::text and entry->'busy' = 'true'::jsonb;
  if day_slots is null or requested_end <= requested_start then return 'unavailable'; end if;
  if exists (select 1 from jsonb_array_elements_text(day_slots) slot
    where case when slot ~ '^[0-9]{2}:[0-9]{2} – [0-9]{2}:[0-9]{2}$'
      then split_part(slot, ' – ', 1)::time < requested_end and split_part(slot, ' – ', 2)::time > requested_start else false end)
    then return 'busy'; end if;
  perform pg_advisory_xact_lock(781426901);
  if exists (select 1 from public.appointment_proposals p where p.sender_id = actor and p.owner_id = shared.user_id
    and p.day = requested_day and p.starts = requested_start and p.ends = requested_end and p.status in ('pending','accepted'))
    then return 'duplicate'; end if;
  insert into public.appointment_proposals(owner_id, sender_id, sender_label, day, starts, ends, message)
    values (shared.user_id, actor, left(label, 254), requested_day, requested_start, requested_end, left(note, 500));
  return 'ok';
end $$;

create function public.agenda_decide(actor uuid, proposal uuid, accept boolean)
returns text language plpgsql security invoker set search_path = '' as $$
declare item public.appointment_proposals%rowtype;
begin
  perform pg_advisory_xact_lock(781426901);
  select * into item from public.appointment_proposals where id = proposal and owner_id = actor and status = 'pending';
  if not found then return 'unavailable'; end if;
  if accept and (
    exists (select 1 from public.appointment_proposals p where p.status = 'accepted' and p.day = item.day
      and (p.owner_id in (item.owner_id,item.sender_id) or p.sender_id in (item.owner_id,item.sender_id))
      and p.starts < item.ends and p.ends > item.starts)
    or exists (
      select 1 from public.workspaces w
      cross join lateral jsonb_array_elements(case when jsonb_typeof(w.data->'events') = 'array' then w.data->'events' else '[]'::jsonb end) e
      where w.user_id in (item.owner_id,item.sender_id) and e->>'day' = item.day::text
        and e->>'start' < left(item.ends::text,5) and e->>'end' > left(item.starts::text,5)
    )
  ) then return 'busy'; end if;
  update public.appointment_proposals set status = case when accept then 'accepted' else 'declined' end where id = item.id;
  return 'ok';
end $$;

revoke all on function public.agenda_propose(uuid,text,uuid,date,time,time,text) from public, anon, authenticated;
revoke all on function public.agenda_decide(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.agenda_propose(uuid,text,uuid,date,time,time,text) to service_role;
grant execute on function public.agenda_decide(uuid,uuid,boolean) to service_role;
grant select on public.workspaces to service_role;
