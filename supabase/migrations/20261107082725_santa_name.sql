-- Nom du Secret Santa (affiché sur les pages et dans la liste « mes Secret Santas » de l'accueil).
alter table public.santas
  add column name text not null default 'Secret Santa' check (length(trim(name)) between 1 and 60);

create or replace function public.get_santa_public(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', s.name, 'mode', s.mode, 'status', s.status,
    'participants', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
                              from participants p where p.santa_id = s.id and p.claimed_at is null), '[]'::jsonb))
  from santas s where s.code = p_code
$$;

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
    'santa', jsonb_build_object('name', s.name, 'mode', s.mode, 'status', s.status, 'code', s.code),
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
