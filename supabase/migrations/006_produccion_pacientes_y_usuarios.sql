-- 006 — Trazabilidad de pacientes, CUI/DPI único y usuarios.activo obligatorio.
-- Aplicar antes de desplegar el backend que usa estas columnas.

alter table public.pacientes
  add column if not exists creado_por uuid references public.usuarios(id),
  add column if not exists actualizado_por uuid references public.usuarios(id),
  add column if not exists actualizado_en timestamp default now();

create unique index if not exists pacientes_documento_unico
  on public.pacientes (documento) where documento is not null;

alter table public.usuarios alter column activo set default true;
alter table public.usuarios alter column activo set not null;
