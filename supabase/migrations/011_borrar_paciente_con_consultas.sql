-- 011 — Al borrar un paciente se borran también sus consultas (ON DELETE CASCADE).
-- Aplicar antes de desplegar el backend que expone DELETE /api/pacientes/:id.
-- Busca la FK por columna porque se creó sin nombre explícito en la 004.

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.conrelid = 'public.consultas'::regclass
      and c.confrelid = 'public.pacientes'::regclass
      and a.attname = 'paciente_id'
  loop
    execute format('alter table public.consultas drop constraint %I', r.conname);
  end loop;

  alter table public.consultas
    add constraint consultas_paciente_id_fkey
    foreign key (paciente_id) references public.pacientes(id) on delete cascade;
end $$;
