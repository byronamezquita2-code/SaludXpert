-- 003 — Restricciones de rol y auth_id en usuarios.

-- Verificación previa: las tres consultas deben devolver 0 filas.
select id, nombre, correo, rol
from public.usuarios
where rol not in ('medico', 'enfermeria', 'administrador');

select auth_id, count(*)
from public.usuarios
where auth_id is not null
group by auth_id
having count(*) > 1;

select u.id, u.nombre, u.auth_id
from public.usuarios u
left join auth.users au on au.id = u.auth_id
where u.auth_id is not null and au.id is null;

-- Aplicar:

alter table public.usuarios
  add constraint usuarios_rol_check
  check (rol in ('medico', 'enfermeria', 'administrador'));

alter table public.usuarios
  add constraint usuarios_auth_id_unique unique (auth_id);

alter table public.usuarios
  add constraint usuarios_auth_id_fkey
  foreign key (auth_id) references auth.users(id) on delete set null;
