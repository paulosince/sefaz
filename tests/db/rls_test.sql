-- Testes do esquema: isolamento por usuário, imutabilidade e "última gravação vence".
\set ON_ERROR_STOP on
set role authenticated;

-- Usuário A grava
select set_config('request.jwt.claim.sub', 'user-a', false);
insert into user_answers (id, question_id, correct, answered_at) values ('00000000-0000-0000-0000-000000000001', 'q1', true, now());
insert into user_answers (id, question_id, correct, answered_at) values ('00000000-0000-0000-0000-000000000001', 'q1', true, now()) on conflict (user_id, id) do nothing;
insert into user_kv (key, value, updated_at) values ('meta', '{"pct":70}', '2026-10-02T00:00:00Z');
-- versão mais antiga não sobrescreve
insert into user_kv (key, value, updated_at) values ('meta', '{"pct":10}', '2026-10-01T00:00:00Z')
  on conflict (user_id, key) do update set value = excluded.value, updated_at = excluded.updated_at;
do $$ begin
  assert (select count(*) from user_answers) = 1, 'A deveria ver 1 resposta (sem duplicar)';
  assert (select value->>'pct' from user_kv where key = 'meta') = '70', 'kv antigo sobrescreveu o novo';
end $$;
-- versão mais nova sobrescreve
insert into user_kv (key, value, updated_at) values ('meta', '{"pct":80}', '2026-10-03T00:00:00Z')
  on conflict (user_id, key) do update set value = excluded.value, updated_at = excluded.updated_at;
do $$ begin assert (select value->>'pct' from user_kv where key = 'meta') = '80', 'kv novo não gravou'; end $$;

-- Usuário B não enxerga nada de A e pode reutilizar o mesmo id
select set_config('request.jwt.claim.sub', 'user-b', false);
do $$ begin
  assert (select count(*) from user_answers) = 0, 'B enxergou respostas de A';
  assert (select count(*) from user_kv) = 0, 'B enxergou kv de A';
end $$;
insert into user_answers (id, question_id, correct, answered_at) values ('00000000-0000-0000-0000-000000000001', 'q1', false, now());

-- B não consegue gravar em nome de A
do $$ begin
  begin
    insert into user_answers (id, user_id, question_id, correct, answered_at) values (gen_random_uuid(), 'user-a', 'q2', true, now());
    raise exception 'RLS permitiu gravar como outro usuário';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Eventos são imutáveis
do $$ begin
  begin
    update user_answers set correct = true;
    raise exception 'UPDATE em evento foi aceito';
  exception when raise_exception then
    if sqlerrm not like '%imutáveis%' then raise; end if;
  end;
end $$;

-- Anônimo não lê nada
reset role;
set role anonymous;
do $$ begin
  begin
    perform count(*) from user_answers;
    raise exception 'anônimo conseguiu ler user_answers';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'OK: todos os testes de banco passaram' as resultado;
