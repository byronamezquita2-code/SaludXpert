-- ============================================================================
-- Fase 3 — Hardening de esquema (SaludXpert)
-- ============================================================================
-- Hoy "usuarios.rol" es un varchar libre (nada impide guardar un valor
-- distinto de medico/enfermeria/administrador) y "usuarios.auth_id" no tiene
-- FOREIGN KEY ni UNIQUE (nada impide que apunte a un auth.users inexistente,
-- ni que dos filas de usuarios compartan el mismo auth_id). Hoy la única
-- validación de "rol" vive en el código de Express — esto agrega una
-- segunda capa a nivel de base de datos.
--
-- IMPORTANTE: antes de correr esto, verifica que no haya datos que violen
-- las constraints nuevas, o el ALTER fallará (de forma segura, sin dañar
-- nada — simplemente no se aplicará hasta que limpies los datos).
-- ============================================================================

-- 1. Verificación previa — debe devolver 0 filas en ambas consultas.
--    Si devuelven filas, hay que corregir esos datos antes de continuar.

-- Roles que no son uno de los tres válidos:
select id, nombre, correo, rol
from public.usuarios
where rol not in ('medico', 'enfermeria', 'administrador');

-- auth_id duplicado entre distintas filas de usuarios:
select auth_id, count(*)
from public.usuarios
where auth_id is not null
group by auth_id
having count(*) > 1;

-- auth_id que no corresponde a ningún usuario real en auth.users
-- (requiere permisos para leer auth.users, normal en el SQL Editor del
-- dashboard con tu usuario):
select u.id, u.nombre, u.auth_id
from public.usuarios u
left join auth.users au on au.id = u.auth_id
where u.auth_id is not null and au.id is null;

-- ============================================================================
-- 2. Si las 3 verificaciones de arriba dieron 0 filas, aplica esto:

alter table public.usuarios
  add constraint usuarios_rol_check
  check (rol in ('medico', 'enfermeria', 'administrador'));

alter table public.usuarios
  add constraint usuarios_auth_id_unique unique (auth_id);

alter table public.usuarios
  add constraint usuarios_auth_id_fkey
  foreign key (auth_id) references auth.users(id) on delete set null;

-- ============================================================================
-- Verificación después de aplicar:
--   select conname, contype from pg_constraint
--   where conrelid = 'public.usuarios'::regclass;
-- Deben aparecer usuarios_rol_check (c), usuarios_auth_id_unique (u) y
-- usuarios_auth_id_fkey (f).
-- ============================================================================
