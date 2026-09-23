-- ============================================================================
-- Fase 6 — Corrección de dato clínico: Impétigo no tiene picazón asociada
-- ============================================================================
-- Al cruzar el catálogo de enfermedades contra el manual oficial "Normas de
-- Atención Integral para la Red Integrada de Servicios de Salud" (MSPAS,
-- 2025), sección Niñez, Impétigo CIE-10 L01 (pág. 403), se encontró que la
-- relación enfermedad_sintoma id=101 (Impétigo → "Picazón en la piel",
-- probabilidad 0.7) no está respaldada por la fuente: el manual describe
-- Impétigo como costras mielicéricas, costra serohemática seca, lesiones
-- escamativas y bulas — sin mencionar prurito/picazón en ningún momento.
--
-- El prurito de predominio nocturno sí aparece como signo característico de
-- Escabiosis (CIE-10 B86, la entrada inmediatamente anterior en el mismo
-- manual) — todo indica que la relación se cargó cruzada entre ambas
-- enfermedades de piel. Escabiosis no está en el catálogo de enfermedades
-- de SaludXpert, así que no hay a dónde reasignar la relación: se elimina.
--
-- Verificación previa — debe devolver exactamente la fila id=101,
-- enfermedad_id=11 (Impétigo), sintoma_id=20 (Picazón en la piel):
select * from public.enfermedad_sintoma where id = 101;

-- ============================================================================
-- Aplicar:

delete from public.enfermedad_sintoma where id = 101;

-- ============================================================================
-- Verificación después de aplicar — las relaciones restantes de Impétigo
-- (enfermedad_id=11) deben ser solo "Lesiones o costras en la piel" y
-- "Fiebre":
--   select es.*, s.nombre from public.enfermedad_sintoma es
--   join public.sintomas s on s.id = es.sintoma_id
--   where es.enfermedad_id = 11;
-- ============================================================================
