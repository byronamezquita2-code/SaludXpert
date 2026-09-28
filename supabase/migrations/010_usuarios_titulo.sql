-- 010 — Título profesional (Dr. / Dra.) de cada usuario.
-- Aplicar antes de desplegar el backend que lee esta columna.

alter table public.usuarios
  add column if not exists titulo text
  check (titulo in ('Dr.', 'Dra.'));
