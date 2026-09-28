-- 008 — Registro de auditoría de acciones administrativas.
-- Guarda correos como texto para que el registro siga legible si se elimina la cuenta.

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
