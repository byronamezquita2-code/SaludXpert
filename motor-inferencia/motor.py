import os
import time
from dotenv import load_dotenv
from supabase import create_client, Client

# Cargar variables de entorno
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Penalización cuando un síntoma ingresado NO está relacionado con la enfermedad.

PENALIZACION_SINTOMA_AUSENTE = 0.05

# ── Caché en memoria ────
# Los datos se refrescan automáticamente cada TTL_SEGUNDOS.
TTL_SEGUNDOS = 300  # 5 minutos

_cache = {
    "enfermedades": None,
    "sintomas": None,
    "relaciones": None,
    "timestamp": 0.0,
}


def _cache_valida() -> bool:
    return (time.time() - _cache["timestamp"]) < TTL_SEGUNDOS


def _refrescar_cache():
    _cache["enfermedades"] = supabase.table("enfermedades").select("*").execute().data
    _cache["sintomas"] = supabase.table("sintomas").select("*").execute().data
    _cache["relaciones"] = supabase.table("enfermedad_sintoma").select("*").execute().data
    _cache["timestamp"] = time.time()


def _obtener_datos():
    """Devuelve (enfermedades, sintomas, relaciones) desde caché o Supabase."""
    if not _cache_valida():
        _refrescar_cache()
    return _cache["enfermedades"], _cache["sintomas"], _cache["relaciones"]


# ── Funciones de acceso individuales (mantenidas para compatibilidad) ─────────

def obtener_enfermedades():
    """Trae todas las enfermedades (con caché)."""
    enfs, _, _ = _obtener_datos()
    return enfs


def obtener_sintomas():
    """Trae todos los síntomas (con caché)."""
    _, sins, _ = _obtener_datos()
    return sins


def obtener_relaciones():
    """Trae las relaciones enfermedad-síntoma con sus probabilidades (con caché)."""
    _, _, rels = _obtener_datos()
    return rels


def construir_red_bayesiana():
    """
    Construye la red bayesiana a partir de los datos en Supabase.
    Cada síntoma depende de la enfermedad (Enfermedad -> Síntoma).
    """
    enfermedades, sintomas, relaciones = _obtener_datos()

    print(f"Enfermedades cargadas: {len(enfermedades)}")
    print(f"Síntomas cargados: {len(sintomas)}")
    print(f"Relaciones cargadas: {len(relaciones)}")

    return enfermedades, sintomas, relaciones


def calcular_diagnostico(sintomas_ingresados: list):
    """
    Recibe una lista de nombres de síntomas y retorna las enfermedades más
    probables ordenadas por confianza (Naive Bayes normalizado).

    sintomas_ingresados: lista de strings, ej: ["Tos", "Fiebre", "Dolor de garganta"]
    """
    # Una sola llamada al caché en lugar de tres llamadas independientes
    enfermedades, sintomas, relaciones = _obtener_datos()

    # Mapeo de nombres a ids
    sintoma_nombre_a_id = {s["nombre"]: s["id"] for s in sintomas}
    ids_sintomas_ingresados = [
        sintoma_nombre_a_id[s] for s in sintomas_ingresados if s in sintoma_nombre_a_id
    ]

    resultados = []

    for enfermedad in enfermedades:
        prob_prior = enfermedad["probabilidad_prior"]
        relaciones_enfermedad = [
            r for r in relaciones if r["enfermedad_id"] == enfermedad["id"]
        ]

        # Calcular probabilidad usando Naive Bayes simplificado
        probabilidad = prob_prior
        sintomas_coincidentes = 0

        for sid in ids_sintomas_ingresados:
            relacion = next(
                (r for r in relaciones_enfermedad if r["sintoma_id"] == sid), None
            )
            if relacion:
                probabilidad *= relacion["probabilidad"]
                sintomas_coincidentes += 1
            else:
                # Penalización: síntoma no es típico de esta enfermedad
                probabilidad *= PENALIZACION_SINTOMA_AUSENTE

        if sintomas_coincidentes > 0:
            resultados.append({
                "enfermedad": enfermedad["nombre"],
                "probabilidad": round(probabilidad, 4),
                "sintomas_coincidentes": sintomas_coincidentes
            })

    # Normalizar probabilidades para que sumen 1 (100%)
    total = sum(r["probabilidad"] for r in resultados)
    if total > 0:
        for r in resultados:
            r["confianza"] = round((r["probabilidad"] / total) * 100, 2)
    else:
        for r in resultados:
            r["confianza"] = 0.0

    # Ordenar de mayor a menor confianza
    return sorted(resultados, key=lambda x: x["confianza"], reverse=True)


if __name__ == "__main__":
    # Prueba local del motor
    print("=== Probando conexión con Supabase ===")
    construir_red_bayesiana()

    print("\n=== Probando diagnóstico con síntomas de ejemplo ===")
    sintomas_prueba = ["Tos", "Fiebre", "Dolor de garganta"]
    print(f"Síntomas ingresados: {sintomas_prueba}\n")

    resultado = calcular_diagnostico(sintomas_prueba)

    for r in resultado[:3]:
        print(f"{r['enfermedad']}: {r['confianza']}% de confianza")

    print("\n=== Segunda llamada (debe usar caché, sin queries a Supabase) ===")
    resultado2 = calcular_diagnostico(["Fiebre", "Escalofríos"])
    for r in resultado2[:3]:
        print(f"{r['enfermedad']}: {r['confianza']}% de confianza")