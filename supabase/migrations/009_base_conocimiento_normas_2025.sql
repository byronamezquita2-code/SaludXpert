-- 009 — Base de conocimiento alineada con las Normas de Atención Integral (MSPAS 2025).
--
-- Fuente: "Normas de Atención Integral para la Red Integrada de Servicios de
-- Salud", MSPAS/DNPAP 2025, Módulo 3 Niñez. Las páginas citadas son las
-- impresas en el libro.
--
-- Qué hace (solo AGREGA; no cambia ni borra valores existentes):
--   1. Marca los signos de peligro del Cuadro No. 1 (pág. 266):
--      nivel_alerta = 'referir' (traslado urgente a hospital) o
--      'atencion_inmediata' (atención inmediata en el servicio).
--   2. Agrega síntomas que el libro usa para distinguir enfermedades y que
--      faltaban (p. ej. exudado amigdalino, ganglios del cuello).
--   3. Agrega Escabiosis (B86, pág. 402), a la que corresponde "Picazón en
--      la piel" (ver migración 005).
--   4. Reubica síntomas urinarios, de oído y de piel en su propia categoría.
--
-- IMPORTANTE: el libro lista signos y síntomas pero NO da probabilidades.
-- Los valores numéricos de abajo son estimaciones a partir del texto
-- ("puede o no haber" → valores bajos). Deben ser revisados por un médico.
--
-- Verificación previa (las tres columnas id deben tener default o identity):
--   select table_name, column_default, is_identity from information_schema.columns
--   where table_schema = 'public' and column_name = 'id'
--     and table_name in ('sintomas', 'enfermedades', 'enfermedad_sintoma');

begin;

alter table public.sintomas
  add column if not exists nivel_alerta text
  check (nivel_alerta in ('referir', 'atencion_inmediata'));

-- sintomas_categoria_check venía del esquema base (creado desde el dashboard,
-- no versionado) y solo permitía 'respiratorio', 'gastrointestinal', 'general'.
alter table public.sintomas drop constraint if exists sintomas_categoria_check;
alter table public.sintomas add constraint sintomas_categoria_check
  check (categoria in ('respiratorio', 'gastrointestinal', 'general', 'urinario', 'oido', 'piel', 'peligro'));

update public.sintomas set categoria = 'urinario'
  where nombre in ('Dolor al orinar', 'Necesidad frecuente de orinar');
update public.sintomas set categoria = 'oido'
  where nombre in ('Dolor de oído', 'Secreción del oído');
update public.sintomas set categoria = 'piel'
  where nombre in ('Picazón en la piel', 'Lesiones o costras en la piel');

-- Cuadro No. 1, columna "atención inmediata en el establecimiento".
update public.sintomas set nivel_alerta = 'atencion_inmediata'
  where nombre = 'Dificultad para respirar';

insert into public.sintomas (nombre, categoria, nivel_alerta)
select v.nombre, v.categoria, v.nivel_alerta
from (values
  -- Cuadro No. 1 (pág. 266): traslado urgente a hospital
  ('No quiere beber o mamar', 'peligro', 'referir'),
  ('Vomita todo lo que come', 'peligro', 'referir'),
  ('Inconsciencia', 'peligro', 'referir'),
  ('Rigidez de cuello', 'peligro', 'referir'),
  ('Irritabilidad', 'peligro', 'referir'),
  ('Saturación de oxígeno menor de 94 %', 'peligro', 'referir'),
  ('Convulsiones o ataques', 'peligro', 'referir'),
  ('Piel o labios morados (cianosis)', 'peligro', 'referir'),
  ('Ruido al respirar (estridor)', 'peligro', 'referir'),
  ('Se le hunden las costillas al respirar (tiraje)', 'peligro', 'referir'),
  ('Deshidratación grave (desmayado, ojos hundidos, pliegue cutáneo muy lento)', 'peligro', 'referir'),
  -- Cuadro No. 1: atención inmediata en el establecimiento
  ('Deshidratación (inquieto, sed intensa, pliegue cutáneo lento)', 'peligro', 'atencion_inmediata'),
  -- Síntomas que faltaban
  ('Secreción nasal', 'respiratorio', null),                          -- págs. 358, 362
  ('Sibilancias (silbido al respirar)', 'respiratorio', null),        -- pág. 357
  ('Amígdalas rojas e inflamadas', 'respiratorio', null),             -- págs. 361-362
  ('Puntos blancos o pus en las amígdalas', 'respiratorio', null),    -- pág. 361
  ('Ganglios del cuello inflamados y dolorosos', 'general', null),    -- págs. 361-362
  ('Lagrimeo u ojos irritados', 'general', null),                     -- pág. 358
  ('Dolores musculares o del cuerpo', 'general', null),               -- pág. 362
  ('Sangre en las heces', 'gastrointestinal', null),                  -- pág. 371
  ('Orina turbia o con mal olor', 'urinario', null),                  -- pág. 351
  ('Disminución de la audición', 'oido', null)                        -- pág. 359
) as v(nombre, categoria, nivel_alerta)
where not exists (select 1 from public.sintomas s where s.nombre = v.nombre);

insert into public.enfermedades (nombre, descripcion, probabilidad_prior)
select 'Escabiosis',
       'Dermatosis pruriginosa muy contagiosa causada por el ácaro Sarcoptes scabiei, conocida como sarna (CIE-10 B86)',
       0.06
where not exists (select 1 from public.enfermedades where nombre = 'Escabiosis');

insert into public.enfermedad_sintoma (enfermedad_id, sintoma_id, probabilidad)
select e.id, s.id, v.probabilidad
from (values
  -- Rinofaringitis J00 (pág. 358)
  ('Rinofaringitis', 'Secreción nasal', 0.85),
  ('Rinofaringitis', 'Lagrimeo u ojos irritados', 0.4),
  ('Rinofaringitis', 'Malestar general', 0.5),
  -- Amigdalitis estreptocócica J03.0 (pág. 361)
  ('Amigdalitis Bacteriana', 'Amígdalas rojas e inflamadas', 0.9),
  ('Amigdalitis Bacteriana', 'Puntos blancos o pus en las amígdalas', 0.8),
  ('Amigdalitis Bacteriana', 'Ganglios del cuello inflamados y dolorosos', 0.75),
  -- Amigdalitis aguda no especificada J03.9 (pág. 362)
  ('Amigdalitis Aguda No Especificada', 'Amígdalas rojas e inflamadas', 0.85),
  ('Amigdalitis Aguda No Especificada', 'Puntos blancos o pus en las amígdalas', 0.1),
  ('Amigdalitis Aguda No Especificada', 'Ganglios del cuello inflamados y dolorosos', 0.35),
  ('Amigdalitis Aguda No Especificada', 'Secreción nasal', 0.45),
  ('Amigdalitis Aguda No Especificada', 'Pérdida de apetito', 0.5),
  -- Neumonía no especificada J18.9 (pág. 357)
  ('Neumonía No Especificada', 'Sibilancias (silbido al respirar)', 0.3),
  ('Neumonía No Especificada', 'Piel o labios morados (cianosis)', 0.15),
  ('Neumonía No Especificada', 'Irritabilidad', 0.4),
  -- Influenza J10.0/J11.8 (págs. 362-363)
  ('Influenza Estacional', 'Secreción nasal', 0.6),
  ('Influenza Estacional', 'Dolores musculares o del cuerpo', 0.7),
  ('Influenza Estacional', 'Escalofríos', 0.5),
  ('Influenza Estacional', 'Vómitos', 0.2),
  ('Influenza Estacional', 'Diarrea', 0.15),
  -- Otitis media aguda H66.9 (pág. 359)
  ('Otitis Media Aguda', 'Disminución de la audición', 0.5),
  ('Otitis Media Aguda', 'Pérdida de apetito', 0.4),
  -- Gastroenteritis A09.0 y Síndrome diarreico agudo A09 (págs. 371-373)
  ('Gastroenteritis', 'Sangre en las heces', 0.15),
  ('Gastroenteritis', 'Deshidratación (inquieto, sed intensa, pliegue cutáneo lento)', 0.3),
  ('Gastroenteritis', 'Deshidratación grave (desmayado, ojos hundidos, pliegue cutáneo muy lento)', 0.1),
  ('Gastroenteritis', 'Vomita todo lo que come', 0.15),
  ('Síndrome Diarreico Agudo', 'Náuseas', 0.4),
  ('Síndrome Diarreico Agudo', 'Vómitos', 0.4),
  ('Síndrome Diarreico Agudo', 'Fiebre', 0.35),
  ('Síndrome Diarreico Agudo', 'Sangre en las heces', 0.1),
  ('Síndrome Diarreico Agudo', 'Deshidratación (inquieto, sed intensa, pliegue cutáneo lento)', 0.35),
  ('Síndrome Diarreico Agudo', 'Deshidratación grave (desmayado, ojos hundidos, pliegue cutáneo muy lento)', 0.1),
  -- Cistitis N30 (pág. 351)
  ('Infección del Tracto Urinario', 'Orina turbia o con mal olor', 0.5),
  -- Parasitosis intestinal B82.9 (pág. 381)
  ('Parasitosis Intestinal', 'Vómitos', 0.3),
  -- Escabiosis B86 (pág. 402)
  ('Escabiosis', 'Picazón en la piel', 0.95),
  ('Escabiosis', 'Lesiones o costras en la piel', 0.6)
) as v(enfermedad, sintoma, probabilidad)
join public.enfermedades e on e.nombre = v.enfermedad
join public.sintomas s on s.nombre = v.sintoma
where not exists (
  select 1 from public.enfermedad_sintoma r
  where r.enfermedad_id = e.id and r.sintoma_id = s.id
);

commit;

-- Verificación posterior:
--   select count(*) from public.sintomas;             -- 23 + 22 = 45
--   select count(*) from public.enfermedades;         -- 12
--   select count(*) from public.enfermedad_sintoma;   -- 47 + 35 = 82
--   select nombre, nivel_alerta from public.sintomas where nivel_alerta is not null;
