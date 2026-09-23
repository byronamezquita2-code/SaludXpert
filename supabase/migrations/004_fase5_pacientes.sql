-- ============================================================================
-- Fase 5 — Tabla de pacientes (SaludXpert)
-- ============================================================================
-- Hasta ahora "consultas" no tenía ningún dato del paciente — cada consulta
-- era anónima respecto a quién la recibió. Esto agrega una tabla "pacientes"
-- real, con antecedentes clínicos básicos (alergias, condiciones crónicas,
-- medicamentos actuales), y la enlaza a "consultas" para poder ver el
-- historial de un paciente específico a través del tiempo.
--
-- El backend usará service_role para esta tabla, igual que para usuarios y
-- consultas — RLS se habilita en deny-by-default, sin políticas para
-- anon/authenticated, consistente con el resto del proyecto.
-- ============================================================================

create table if not exists public.pacientes (
  id uuid primary key default gen_random_uuid(),
  nombre varchar not null,
  documento varchar,
  fecha_nacimiento date,
  alergias text,
  condiciones_cronicas text,
  medicamentos_actuales text,
  creado_en timestamp default now()
);

comment on table public.pacientes is
  'Pacientes atendidos en el centro de salud. Datos clínicos sensibles — solo accesible vía service_role desde el backend.';

alter table public.consultas
  add column if not exists paciente_id uuid references public.pacientes(id);

alter table public.pacientes enable row level security;
alter table public.pacientes force row level security;

-- Sin políticas para anon/authenticated: mismo modelo que usuarios/consultas
-- (ver 001_cerrar_acceso_anonimo.sql) — el único acceso previsto es vía el backend
-- con la service_role key.

-- ============================================================================
-- Verificación después de aplicar:
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'pacientes'
--   order by ordinal_position;
--
--   select conname, contype from pg_constraint
--   where conrelid = 'public.pacientes'::regclass;
--
--   -- Debe devolver [] (anon sin acceso, igual que usuarios/consultas):
--   curl "$SUPABASE_URL/rest/v1/pacientes?select=*" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
-- ============================================================================
