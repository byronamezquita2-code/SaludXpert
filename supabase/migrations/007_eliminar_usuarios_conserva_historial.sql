-- 007 — Permitir eliminar usuarios conservando sus consultas y pacientes (ON DELETE SET NULL).
-- Recorre las FKs hacia usuarios porque la de consultas.usuario_id no está versionada.

do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tabla, a.attname as columna
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.usuarios'::regclass
      and array_length(c.conkey, 1) = 1
  loop
    execute format('alter table %s alter column %I drop not null', r.tabla, r.columna);
    execute format('alter table %s drop constraint %I', r.tabla, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references public.usuarios(id) on delete set null',
      r.tabla, r.conname, r.columna
    );
  end loop;
end $$;
