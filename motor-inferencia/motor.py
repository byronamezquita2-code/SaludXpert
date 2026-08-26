import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Cargar variables de entorno
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def obtener_enfermedades():
    """Trae todas las enfermedades desde Supabase"""
    response = supabase.table("enfermedades").select("*").execute()
    return response.data


def obtener_sintomas():
    """Trae todos los síntomas desde Supabase"""
    response = supabase.table("sintomas").select("*").execute()
    return response.data


def obtener_relaciones():
    """Trae las relaciones enfermedad-síntoma con sus probabilidades"""
    response = supabase.table("enfermedad_sintoma").select("*").execute()
    return response.data


def construir_red_bayesiana():
    """
    Construye la red bayesiana a partir de los datos en Supabase.
    Cada síntoma depende de la enfermedad (Enfermedad -> Síntoma).
    """
    enfermedades = obtener_enfermedades()
    sintomas = obtener_sintomas()
    relaciones = obtener_relaciones()

    print(f"Enfermedades cargadas: {len(enfermedades)}")
    print(f"Síntomas cargados: {len(sintomas)}")
    print(f"Relaciones cargadas: {len(relaciones)}")

    return enfermedades, sintomas, relaciones


def calcular_diagnostico(sintomas_ingresados: list):
    """
    Función principal: recibe una lista de nombres de síntomas
    y retorna las enfermedades más probables ordenadas por confianza.

    sintomas_ingresados: lista de strings, ej: ["Tos", "Fiebre", "Dolor de garganta"]
    """
    enfermedades = obtener_enfermedades()
    relaciones = obtener_relaciones()
    sintomas = obtener_sintomas()

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
                probabilidad *= 0.05  # penalización si el síntoma no es típico

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
    resultados_ordenados = sorted(resultados, key=lambda x: x["confianza"], reverse=True)

    return resultados_ordenados


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