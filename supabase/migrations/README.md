# Migraciones — SaludXpert

SQL aplicado manualmente en el SQL Editor de Supabase, en el orden numerado
de este directorio. No hay migrador automático — cada archivo se corre a
mano y luego se hace commit para dejar constancia de qué cambió y por qué.

El esquema base (tablas `enfermedades`, `sintomas`, `enfermedad_sintoma`,
`usuarios`, `consultas` y las políticas RLS originales) se creó directamente
desde el dashboard de Supabase antes de empezar a versionar este SQL, así
que no tiene un archivo aquí — es el estado sobre el que actúa
`001_cerrar_acceso_anonimo.sql`. A partir de estos 4 archivos, todo cambio
de esquema nuevo debe agregarse como un archivo numerado en este directorio.

## Archivos

| # | Archivo | Qué hace |
|---|---|---|
| 001 | `cerrar_acceso_anonimo.sql` | Elimina las políticas RLS públicas de `usuarios` y `consultas` (lectura/escritura anónima) — el acceso queda restringido a `service_role` desde el backend. |
| 002 | `fase2_consultas_actualizado_por.sql` | Agrega `consultas.actualizado_por` (FK a `usuarios`) para trazar quién confirmó o descartó un diagnóstico. |
| 003 | `fase3_hardening_usuarios.sql` | Agrega constraints a `usuarios`: `rol` limitado a los 3 valores válidos, `auth_id` único y con FK a `auth.users`. Incluye queries de verificación previa — no aplicar si esas queries devuelven filas. |
| 004 | `fase5_pacientes.sql` | Crea la tabla `pacientes` (con antecedentes clínicos) y la enlaza a `consultas` vía `paciente_id`. RLS deny-by-default, igual que el resto. |

## Cómo verificar qué ya está aplicado

Corre esto en el SQL Editor de Supabase — te dice, para cada migración, si
ya está aplicada:

```sql
-- 001: ¿siguen existiendo las políticas públicas? (si esto no devuelve filas, 001 ya está aplicada)
select policyname from pg_policies
where tablename in ('usuarios', 'consultas')
  and policyname like '%publico%';

-- 002: ¿existe la columna actualizado_por?
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'consultas' and column_name = 'actualizado_por';

-- 003: ¿existen las constraints de hardening?
select conname from pg_constraint
where conrelid = 'public.usuarios'::regclass
  and conname in ('usuarios_rol_check', 'usuarios_auth_id_unique', 'usuarios_auth_id_fkey');

-- 004: ¿existe la tabla pacientes?
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'pacientes';
```

Si alguna consulta no devuelve lo esperado, corre el archivo correspondiente
(en orden, 001 → 004) en el SQL Editor.

## Aplicar una migración nueva

1. Escribe el archivo como `NNN_descripcion_corta.sql`, siguiendo el número
   siguiente disponible.
2. Corre las queries de verificación previa que incluya (si aplica).
3. Ejecútalo en el SQL Editor de Supabase.
4. Corre la verificación posterior que incluya.
5. Haz commit del archivo — es la única constancia de ese cambio.
