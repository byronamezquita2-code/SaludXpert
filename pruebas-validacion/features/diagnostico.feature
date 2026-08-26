# language: es
Característica: Diagnóstico preliminar de enfermedades
  Como personal de enfermería
  Quiero registrar los síntomas del paciente
  Para obtener un diagnóstico preliminar confiable

  Escenario: CU-03 - Registrar síntomas y generar diagnóstico preliminar
    Dado que el sistema está disponible
    Cuando el personal envía los síntomas "Diarrea, Dolor abdominal, Náuseas"
    Entonces el sistema debe retornar una lista de diagnósticos
    Y el diagnóstico principal debe ser "Gastroenteritis"

  Escenario: CU-03 - Advertencia cuando la confianza es baja
    Dado que el sistema está disponible
    Cuando el personal envía un único síntoma "Fatiga"
    Entonces el sistema debe indicar que la confianza no es suficiente

  Escenario: CU-06 - Consultar historial de consultas
    Dado que el sistema está disponible
    Cuando el médico solicita el historial de consultas
    Entonces el sistema debe retornar al menos una consulta registrada

  Escenario: Obtener catálogo de síntomas disponibles
    Dado que el sistema está disponible
    Cuando se solicita la lista de síntomas
    Entonces el sistema debe retornar exactamente 15 síntomas