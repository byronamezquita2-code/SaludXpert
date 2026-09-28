# Migraciones

Se aplican a mano, en orden, en el SQL Editor de Supabase. El esquema base se creó desde el dashboard y no tiene archivo.

| # | Qué hace |
|---|---|
| 001 | Cierra el acceso anónimo a `usuarios` y `consultas`. |
| 002 | Agrega `consultas.actualizado_por`. |
| 003 | Restringe `usuarios.rol` y hace `auth_id` único con FK a `auth.users`. |
| 004 | Crea la tabla `pacientes` y la enlaza a `consultas`. |
| 005 | Quita la relación Impétigo → "Picazón en la piel". |
| 006 | Trazabilidad de pacientes, CUI/DPI único y `usuarios.activo` obligatorio. |
| 007 | FKs hacia `usuarios` con `ON DELETE SET NULL`. |
| 008 | Tabla `auditoria`. |
| 009 | Base de conocimiento según las Normas MSPAS 2025 y signos de peligro. |
| 010 | `usuarios.titulo` (Dr. / Dra.). |

## Verificar qué está aplicado

```sql
-- 001: no debe devolver filas
select policyname from pg_policies
where tablename in ('usuarios', 'consultas') and policyname like '%publico%';

-- 002
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'consultas' and column_name = 'actualizado_por';

-- 003
select conname from pg_constraint
where conrelid = 'public.usuarios'::regclass
  and conname in ('usuarios_rol_check', 'usuarios_auth_id_unique', 'usuarios_auth_id_fkey');

-- 004
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'pacientes';

-- 005: no debe devolver filas
select * from public.enfermedad_sintoma where id = 101;

-- 006
select indexname from pg_indexes where indexname = 'pacientes_documento_unico';

-- 007: todas con confdeltype = 'n'
select conrelid::regclass as tabla, conname, confdeltype from pg_constraint
where contype = 'f' and confrelid = 'public.usuarios'::regclass;

-- 008
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'auditoria';

-- 009: 45 síntomas, 12 enfermedades, 82 relaciones
select (select count(*) from public.sintomas), (select count(*) from public.enfermedades),
       (select count(*) from public.enfermedad_sintoma);

-- 010
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'usuarios' and column_name = 'titulo';
```
