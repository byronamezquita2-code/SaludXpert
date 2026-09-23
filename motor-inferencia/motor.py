import os
import time
from dotenv import load_dotenv
from supabase import create_client, Client

from pgmpy.inference import VariableElimination
from pgmpy.factors.discrete import TabularCPD

try:
    from pgmpy.models import DiscreteBayesianNetwork as BayesianNetwork
except ImportError:
    try:
        from pgmpy.models import BayesianNetwork
    except ImportError:
        from pgmpy.models import BayesianModel as BayesianNetwork

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

PENALIZACION_SINTOMA_AUSENTE = 0.05

TTL_SEGUNDOS = 300

_cache = {
    "enfermedades": None,
    "sintomas": None,
    "relaciones": None,
    "modelo": None,
    "timestamp": 0.0,
}


def _cache_valida() -> bool:
    return (time.time() - _cache["timestamp"]) < TTL_SEGUNDOS


def _refrescar_cache():
    _cache["enfermedades"] = supabase.table("enfermedades").select("*").execute().data
    _cache["sintomas"] = supabase.table("sintomas").select("*").execute().data
    _cache["relaciones"] = supabase.table("enfermedad_sintoma").select("*").execute().data
    _cache["modelo"] = _construir_modelo(
        _cache["enfermedades"], _cache["sintomas"], _cache["relaciones"]
    )
    _cache["timestamp"] = time.time()


def _obtener_datos():
    if not _cache_valida():
        _refrescar_cache()
    return _cache["enfermedades"], _cache["sintomas"], _cache["relaciones"]


def _obtener_modelo() -> "BayesianNetwork":
    if not _cache_valida():
        _refrescar_cache()
    return _cache["modelo"]


def obtener_enfermedades():
    enfs, _, _ = _obtener_datos()
    return enfs


def obtener_sintomas():
    _, sins, _ = _obtener_datos()
    return sins


def obtener_relaciones():
    _, _, rels = _obtener_datos()
    return rels


def _construir_modelo(enfermedades, sintomas, relaciones) -> "BayesianNetwork":
    nombres_enfermedades = [e["nombre"] for e in enfermedades]
    nombres_sintomas = [s["nombre"] for s in sintomas]

    total_prior = sum(e["probabilidad_prior"] for e in enfermedades) or 1
    priors = [e["probabilidad_prior"] / total_prior for e in enfermedades]

    relacion_por_par = {
        (r["enfermedad_id"], r["sintoma_id"]): r["probabilidad"] for r in relaciones
    }

    aristas = [("Enfermedad", nombre) for nombre in nombres_sintomas]
    modelo = BayesianNetwork(aristas)
    if not aristas:
        modelo.add_node("Enfermedad")

    cpds = [
        TabularCPD(
            variable="Enfermedad",
            variable_card=len(nombres_enfermedades),
            values=[[p] for p in priors],
            state_names={"Enfermedad": nombres_enfermedades},
        )
    ]

    for sintoma in sintomas:
        p_presente = []
        for enfermedad in enfermedades:
            prob = relacion_por_par.get(
                (enfermedad["id"], sintoma["id"]), PENALIZACION_SINTOMA_AUSENTE
            )
            prob = min(max(float(prob), 0.0001), 0.9999)
            p_presente.append(prob)
        p_ausente = [1 - p for p in p_presente]

        cpds.append(
            TabularCPD(
                variable=sintoma["nombre"],
                variable_card=2,
                values=[p_ausente, p_presente],
                evidence=["Enfermedad"],
                evidence_card=[len(nombres_enfermedades)],
                state_names={
                    sintoma["nombre"]: ["Ausente", "Presente"],
                    "Enfermedad": nombres_enfermedades,
                },
            )
        )

    modelo.add_cpds(*cpds)
    modelo.check_model()
    return modelo


def construir_red_bayesiana():
    enfermedades, sintomas, relaciones = _obtener_datos()
    modelo = _obtener_modelo()

    print(f"Enfermedades cargadas: {len(enfermedades)}")
    print(f"Síntomas cargados: {len(sintomas)}")
    print(f"Relaciones cargadas: {len(relaciones)}")
    print(f"Nodos de la red bayesiana: {len(modelo.nodes())}")
    print(f"Aristas de la red bayesiana: {len(modelo.edges())}")
    print(f"Modelo válido (check_model): {modelo.check_model()}")

    return enfermedades, sintomas, relaciones


def calcular_diagnostico(sintomas_ingresados: list):
    enfermedades, sintomas, relaciones = _obtener_datos()
    modelo = _obtener_modelo()

    sintoma_nombre_a_id = {s["nombre"]: s["id"] for s in sintomas}
    nombres_sintomas_red = set(modelo.nodes()) - {"Enfermedad"}

    evidencia = {
        nombre: "Presente"
        for nombre in sintomas_ingresados
        if nombre in sintoma_nombre_a_id and nombre in nombres_sintomas_red
    }

    inferencia = VariableElimination(modelo)
    if evidencia:
        distribucion = inferencia.query(
            variables=["Enfermedad"], evidence=evidencia, show_progress=False
        )
    else:
        distribucion = inferencia.query(variables=["Enfermedad"], show_progress=False)

    probabilidad_por_enfermedad = dict(
        zip(distribucion.state_names["Enfermedad"], distribucion.values)
    )

    ids_evidencia = {sintoma_nombre_a_id[nombre] for nombre in evidencia}

    resultados = []
    for enfermedad in enfermedades:
        ids_sintomas_relacionados = {
            r["sintoma_id"] for r in relaciones if r["enfermedad_id"] == enfermedad["id"]
        }
        sintomas_coincidentes = len(ids_evidencia & ids_sintomas_relacionados)

        if sintomas_coincidentes > 0:
            resultados.append({
                "enfermedad": enfermedad["nombre"],
                "probabilidad": round(float(probabilidad_por_enfermedad[enfermedad["nombre"]]), 6),
                "sintomas_coincidentes": sintomas_coincidentes,
            })

    total = sum(r["probabilidad"] for r in resultados)
    if total > 0:
        for r in resultados:
            r["confianza"] = round((r["probabilidad"] / total) * 100, 2)
    else:
        for r in resultados:
            r["confianza"] = 0.0

    return sorted(resultados, key=lambda x: x["confianza"], reverse=True)


if __name__ == "__main__":
    print("=== Probando conexión con Supabase y construcción de la red ===")
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
