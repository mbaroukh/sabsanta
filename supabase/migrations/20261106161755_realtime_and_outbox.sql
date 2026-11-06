-- Outbox : on mémorise le rôle de l'expéditeur (jamais le contenu : la messagerie est anonyme).
create or replace function private.notify_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_target participants;
begin
  if new.from_role = 'santa' then
    select p.* into v_target from participants p join assignments a on a.receiver_id = p.id where a.giver_id = new.assignment_id;
  else
    select * into v_target from participants where id = new.assignment_id;
  end if;
  perform realtime.send(jsonb_build_object('id', new.id), 'message', 'inbox:' || v_target.inbox_key, false);
  if v_target.email is not null and (v_target.last_seen_at is null or v_target.last_seen_at < now() - interval '2 minutes') then
    insert into email_outbox (to_email, kind, payload)
    values (v_target.email, 'new_message',
            jsonb_build_object('participant_id', v_target.id, 'from_role', new.from_role));
  end if;
  return new;
end $$;

-- Temps réel : « Secret Santa démarré » prévient la boîte de chaque participant.
create or replace function private.notify_started() returns trigger
language plpgsql security definer set search_path = public as $$
declare p participants;
begin
  if new.status = 'started' and old.status is distinct from 'started' then
    for p in select * from participants where santa_id = new.id loop
      perform realtime.send(jsonb_build_object('status', 'started'), 'started', 'inbox:' || p.inbox_key, false);
    end loop;
  end if;
  return new;
end $$;

create trigger santas_notify_started after update of status on public.santas
for each row execute function private.notify_started();
