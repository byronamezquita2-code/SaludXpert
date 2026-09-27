-- 007 — Permitir eliminar usuarios conservando su historial.
--
-- Hoy consultas.usuario_id, consultas.actualizado_por, pacientes.creado_por y
-- pacientes.actualizado_por apuntan a usuarios(id) sin regla ON DELETE, así
-- que borrar un usuario con consultas o pacientes falla (error 23503).
-- Con esta migración, al borrar un usuario esas columnas quedan en NULL y
-- las consultas y pacientes se conservan.
--
-- Recorre todas las llaves foráneas que apuntan a public.usuarios en vez de
-- nombrarlas, porque consultas.usuario_id viene del esquema base creado desde
-- el dashboard y su constraint no está versionada.
--
-- Verificación previa (lista las FKs afectadas; confdeltype 'a' = sin acción):
--   select conrelid::regclass as tabla, conname, confdeltype
--   from pg_constraint
--   where contype = 'f' and confrelid = 'public.usuarios'::regclass;

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

-- Verificación posterior: todas las filas deben tener confdeltype = 'n' (set null).
--   select conrelid::regclass as tabla, conname, confdeltype
--   from pg_constraint
--   where contype = 'f' and confrelid = 'public.usuarios'::regclass;
