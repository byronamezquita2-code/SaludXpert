-- 006 — Trazabilidad de pacientes, CUI/DPI único y usuarios.activo obligatorio.
--
-- Antes de aplicar, estas dos consultas deben devolver 0 filas:
--   select documento, count(*) from public.pacientes
--   where documento is not null group by documento having count(*) > 1;
--
--   select id, correo from public.usuarios where activo is null;
--
-- Aplicar ANTES de desplegar el backend que escribe estas columnas.

alter table public.pacientes
  add column if not exists creado_por uuid references public.usuarios(id),
  add column if not exists actualizado_por uuid references public.usuarios(id),
  add column if not exists actualizado_en timestamp default now();

create unique index if not exists pacientes_documento_unico
  on public.pacientes (documento) where documento is not null;

alter table public.usuarios alter column activo set default true;
alter table public.usuarios alter column activo set not null;

-- Verificación posterior:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'pacientes'
--     and column_name in ('creado_por', 'actualizado_por', 'actualizado_en');
--
--   select indexname from pg_indexes where indexname = 'pacientes_documento_unico';
--
--   select is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'usuarios' and column_name = 'activo';
