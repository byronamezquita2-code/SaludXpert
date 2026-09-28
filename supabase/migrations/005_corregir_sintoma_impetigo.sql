-- 005 — Quitar la relación Impétigo → "Picazón en la piel" (no está en las Normas MSPAS 2025).

-- Verificación previa: debe devolver la fila id=101 (Impétigo, Picazón en la piel).
select * from public.enfermedad_sintoma where id = 101;

-- Aplicar:

delete from public.enfermedad_sintoma where id = 101;
