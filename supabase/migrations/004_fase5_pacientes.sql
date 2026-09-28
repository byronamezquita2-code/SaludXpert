-- 004 — Tabla de pacientes enlazada a consultas (RLS sin políticas: solo el backend).

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
