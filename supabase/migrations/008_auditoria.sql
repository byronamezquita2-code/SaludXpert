-- 008 — Registro de auditoría de acciones administrativas.
--
-- Guarda quién creó, activó/desactivó o eliminó un usuario y cuándo. Los datos
-- de quien actuó y del usuario afectado se copian como texto (correo, nombre)
-- para que el registro siga siendo legible aunque esas cuentas se eliminen.
--
-- Solo escribe el backend con service_role; RLS deny-by-default como el resto.
-- Se puede aplicar antes o después de desplegar el backend: si la tabla aún no
-- existe, el backend registra el fallo en Sentry y la acción sigue funcionando.

create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(),
  actor_id uuid references public.usuarios(id) on delete set null,
  actor_correo text,
  accion text not null,
  objetivo_id uuid,
  objetivo_correo text,
  detalle jsonb
);

create index if not exists auditoria_fecha_idx on public.auditoria (fecha desc);

comment on table public.auditoria is
  'Acciones administrativas (crear, activar/desactivar, eliminar usuarios). Solo accesible vía service_role desde el backend.';

alter table public.auditoria enable row level security;
alter table public.auditoria force row level security;

-- Verificación posterior:
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'auditoria'
--   order by ordinal_position;
--
-- Consultar el registro (SQL Editor):
--   select fecha, actor_correo, accion, objetivo_correo, detalle
--   from public.auditoria order by fecha desc limit 100;
