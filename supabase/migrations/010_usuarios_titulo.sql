-- 010 — Título profesional de cada usuario ("Dr." / "Dra.").
--
-- La app muestra "Dr. Nombre" o "Dra. Nombre" en la barra superior y en la
-- tabla de usuarios. El sistema no guarda el sexo de las personas y no debe
-- deducirse del nombre, así que el administrador elige el título al crear a
-- un médico o después desde el panel. Queda vacío para quien no lo use.
--
-- IMPORTANTE: aplicar ANTES de desplegar el backend que lee esta columna;
-- si el backend nuevo corre sin ella, nadie podrá iniciar sesión.

alter table public.usuarios
  add column if not exists titulo text
  check (titulo in ('Dr.', 'Dra.'));

-- Verificación posterior:
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'usuarios' and column_name = 'titulo';
