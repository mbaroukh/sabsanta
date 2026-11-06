-- Sabsanta : schéma. RLS activée, AUCUNE policy => aucun accès direct. Tout passe par des RPC security definer.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.gen_short_id() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  bytes bytea := extensions.gen_random_bytes(32);
  result text := '';
  i int := 0;
begin
  -- 22 caractères base62 (rejet des octets >= 248 pour éviter le biais modulo)
  while length(result) < 22 loop
    if i >= 32 then bytes := extensions.gen_random_bytes(32); i := 0; end if;
    if get_byte(bytes, i) < 248 then
      result := result || substr(alphabet, (get_byte(bytes, i) % 62) + 1, 1);
    end if;
    i := i + 1;
  end loop;
  return result;
end $$;

create table public.santas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.gen_short_id(),
  admin_token text not null unique default public.gen_short_id(),
  mode text not null check (mode in ('classic','sab')),
  status text not null default 'open' check (status in ('open','drawn','started')),
  created_at timestamptz not null default now()
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  santa_id uuid not null references public.santas(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  is_admin boolean not null default false,
  token text unique,
  inbox_key text not null unique default public.gen_short_id(),
  claimed_at timestamptz,
  revealed_at timestamptz,
  prefs_submitted_at timestamptz,
  email text,
  wishes text not null default '',
  last_seen_at timestamptz,
  unique (santa_id, name)
);

create table public.exclusions (
  giver_id uuid not null references public.participants(id) on delete cascade,
  receiver_id uuid not null references public.participants(id) on delete cascade,
  primary key (giver_id, receiver_id)
);

create table public.preferences (
  giver_id uuid not null references public.participants(id) on delete cascade,
  receiver_id uuid not null references public.participants(id) on delete cascade,
  rank int not null check (rank >= 1),
  primary key (giver_id, receiver_id),
  unique (giver_id, rank)
);

create table public.assignments (
  giver_id uuid primary key references public.participants(id) on delete cascade,
  receiver_id uuid not null unique references public.participants(id) on delete cascade,
  check (giver_id <> receiver_id)
);

create table public.messages (
  id bigint generated always as identity primary key,
  assignment_id uuid not null references public.assignments(giver_id) on delete cascade,
  from_role text not null check (from_role in ('santa','child')),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.email_outbox (
  id bigint generated always as identity primary key,
  to_email text not null,
  kind text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.santas enable row level security;
alter table public.participants enable row level security;
alter table public.exclusions enable row level security;
alter table public.preferences enable row level security;
alter table public.assignments enable row level security;
alter table public.messages enable row level security;
alter table public.email_outbox enable row level security;
revoke all on all tables in schema public from anon, authenticated;

-- ===== helpers internes (non exposés) =====
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.participant_by_token(p_token text) returns public.participants
language sql stable security definer set search_path = public as $$
  select * from public.participants where token = p_token and p_token is not null limit 1
$$;

create or replace function private.admin_participant(p_admin_token text) returns public.participants
language sql stable security definer set search_path = public as $$
  select p.* from public.participants p join public.santas s on s.id = p.santa_id
  where s.admin_token = p_admin_token and p.is_admin and p.token is not null limit 1
$$;

-- ===== RPC publiques =====
create or replace function public.get_santa_public(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'mode', s.mode, 'status', s.status,
    'participants', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
                              from participants p where p.santa_id = s.id and p.claimed_at is null), '[]'::jsonb))
  from santas s where s.code = p_code
$$;

create or replace function public.claim_participant(p_code text, p_participant_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text := public.gen_short_id(); v_rows int;
begin
  update participants p set token = v_token, claimed_at = now(), last_seen_at = now()
  from santas s
  where p.id = p_participant_id and p.santa_id = s.id and s.code = p_code and p.claimed_at is null;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'already_claimed_or_unknown' using errcode = 'P0001'; end if;
  return v_token;
end $$;

create or replace function public.touch(p_token text) returns void
language sql security definer set search_path = public as $$
  update participants set last_seen_at = now() where token = p_token
$$;

create or replace function public.set_email(p_token text, p_email text) returns void
language sql security definer set search_path = public as $$
  update participants set email = nullif(trim(p_email), '') where token = p_token
$$;

create or replace function public.set_wishes(p_token text, p_wishes text) returns void
language sql security definer set search_path = public as $$
  update participants set wishes = left(coalesce(p_wishes, ''), 2000) where token = p_token
$$;

create or replace function public.mark_revealed(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare me participants; v_remaining int;
begin
  me := private.participant_by_token(p_token);
  if me.id is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from assignments where giver_id = me.id) then raise exception 'no_assignment'; end if;
  update participants set revealed_at = coalesce(revealed_at, now()) where id = me.id;
  select count(*) into v_remaining from participants
    where santa_id = me.santa_id and revealed_at is null;
  if v_remaining = 0 then
    update santas set status = 'started' where id = me.santa_id and mode = 'classic';
  end if;
end $$;

create or replace function public.send_message(p_token text, p_direction text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare me participants; v_assignment uuid; v_from text;
begin
  me := private.participant_by_token(p_token);
  if me.id is null then raise exception 'unauthorized'; end if;
  if p_direction = 'to_child' then
    v_assignment := me.id; v_from := 'santa';
    if me.revealed_at is null then raise exception 'not_revealed'; end if;
  elsif p_direction = 'to_santa' then
    select giver_id into v_assignment from assignments where receiver_id = me.id; v_from := 'child';
  else raise exception 'bad_direction'; end if;
  if v_assignment is null then raise exception 'no_assignment'; end if;
  insert into messages (assignment_id, from_role, body) values (v_assignment, v_from, trim(p_body));
end $$;

create or replace function public.get_participant_view(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me participants; s santas; v_child participants; v_santa_id uuid; v_result jsonb;
begin
  me := private.participant_by_token(p_token);
  if me.id is null then raise exception 'unauthorized'; end if;
  update participants set last_seen_at = now() where id = me.id;
  select * into s from santas where id = me.santa_id;
  if me.revealed_at is not null then
    select p.* into v_child from participants p join assignments a on a.receiver_id = p.id where a.giver_id = me.id;
  end if;
  select giver_id into v_santa_id from assignments where receiver_id = me.id;
  v_result := jsonb_build_object(
    'me', jsonb_build_object('id', me.id, 'name', me.name, 'is_admin', me.is_admin, 'email', me.email,
          'wishes', me.wishes, 'inbox_key', me.inbox_key, 'revealed', me.revealed_at is not null,
          'prefs_submitted', me.prefs_submitted_at is not null),
    'santa', jsonb_build_object('mode', s.mode, 'status', s.status, 'code', s.code),
    'has_assignment', exists (select 1 from assignments where giver_id = me.id),
    'child', case when v_child.id is null then null
             else jsonb_build_object('name', v_child.name, 'wishes', v_child.wishes) end,
    'progress', jsonb_build_object(
      'total', (select count(*) from participants where santa_id = s.id),
      'joined', (select count(*) from participants where santa_id = s.id and claimed_at is not null),
      'prefs_done', (select count(*) from participants where santa_id = s.id and prefs_submitted_at is not null),
      'revealed', (select count(*) from participants where santa_id = s.id and revealed_at is not null)),
    'to_child', case when v_child.id is null then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object('id', m.id, 'from', m.from_role, 'body', m.body, 'at', m.created_at) order by m.id)
        from messages m where m.assignment_id = me.id), '[]'::jsonb) end,
    'to_santa', case when v_santa_id is null then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object('id', m.id, 'from', m.from_role, 'body', m.body, 'at', m.created_at) order by m.id)
        from messages m where m.assignment_id = v_santa_id), '[]'::jsonb) end,
    'preferences', coalesce((select jsonb_agg(jsonb_build_object('receiver_id', receiver_id, 'rank', rank) order by rank)
        from preferences where giver_id = me.id), '[]'::jsonb),
    'candidates', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
        from participants p where p.santa_id = s.id and p.id <> me.id
          and not exists (select 1 from exclusions e where e.giver_id = me.id and e.receiver_id = p.id)), '[]'::jsonb));
  return v_result;
end $$;

create or replace function public.get_admin_view(p_admin_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me participants;
begin
  me := private.admin_participant(p_admin_token);
  if me.id is null then raise exception 'unauthorized'; end if;
  return jsonb_build_object('participants', coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'joined', p.claimed_at is not null,
      'revealed', p.revealed_at is not null, 'prefs_submitted', p.prefs_submitted_at is not null,
      'is_admin', p.is_admin) order by p.name) from participants p where p.santa_id = me.santa_id), '[]'::jsonb));
end $$;

create or replace function public.admin_reset_participant(p_admin_token text, p_participant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me participants; s santas;
begin
  me := private.admin_participant(p_admin_token);
  if me.id is null then raise exception 'unauthorized'; end if;
  select * into s from santas where id = me.santa_id;
  if s.status = 'started' then raise exception 'already_started'; end if;
  if p_participant_id = me.id then raise exception 'cannot_reset_self'; end if;
  update participants set token = null, claimed_at = null, revealed_at = null, email = null,
    prefs_submitted_at = null, last_seen_at = null, inbox_key = public.gen_short_id()
  where id = p_participant_id and santa_id = s.id;
  delete from preferences where giver_id = p_participant_id;
end $$;

-- ===== temps réel : broadcast sur le topic public inbox:<inbox_key> =====
create or replace function private.notify_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_target participants; v_santa participants; v_recent boolean;
begin
  if new.from_role = 'santa' then
    select p.* into v_target from participants p join assignments a on a.receiver_id = p.id where a.giver_id = new.assignment_id;
  else
    select * into v_target from participants where id = new.assignment_id;
  end if;
  perform realtime.send(jsonb_build_object('id', new.id), 'message', 'inbox:' || v_target.inbox_key, false);
  if v_target.email is not null and (v_target.last_seen_at is null or v_target.last_seen_at < now() - interval '2 minutes') then
    insert into email_outbox (to_email, kind, payload)
    values (v_target.email, 'new_message', jsonb_build_object('participant_id', v_target.id));
  end if;
  return new;
end $$;

create trigger messages_notify after insert on public.messages
for each row execute function private.notify_message();

-- ===== droits : seules les RPC publiques sont appelables =====
revoke all on all functions in schema public from public;
grant execute on function
  public.get_santa_public(text), public.claim_participant(text, uuid), public.touch(text),
  public.set_email(text, text), public.set_wishes(text, text), public.mark_revealed(text),
  public.send_message(text, text, text), public.get_participant_view(text),
  public.get_admin_view(text), public.admin_reset_participant(text, uuid)
to anon, authenticated;
