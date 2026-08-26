import pytest
from motor import calcular_diagnostico


def test_diagnostico_retorna_lista():
    """Verifica que el motor retorne una lista de resultados"""
    resultado = calcular_diagnostico(["Tos", "Fiebre"])
    assert isinstance(resultado, list)


def test_diagnostico_no_vacio_con_sintomas_validos():
    """Verifica que con síntomas válidos se obtenga al menos un resultado"""
    resultado = calcular_diagnostico(["Tos", "Fiebre", "Dolor de garganta"])
    assert len(resultado) > 0


def test_diagnostico_ordenado_por_confianza():
    """Verifica que los resultados estén ordenados de mayor a menor confianza"""
    resultado = calcular_diagnostico(["Tos", "Fiebre", "Dolor de garganta"])
    confianzas = [r["confianza"] for r in resultado]
    assert confianzas == sorted(confianzas, reverse=True)


def test_diagnostico_rinofaringitis_sintomas_tipicos():
    """Verifica que síntomas típicos de Rinofaringitis den ese diagnóstico como principal"""
    resultado = calcular_diagnostico(["Tos", "Dolor de garganta", "Congestión nasal", "Estornudos"])
    assert resultado[0]["enfermedad"] == "Rinofaringitis"


def test_diagnostico_gastroenteritis_sintomas_tipicos():
    """Verifica que síntomas típicos de Gastroenteritis den ese diagnóstico como principal"""
    resultado = calcular_diagnostico(["Náuseas", "Vómitos", "Diarrea", "Dolor abdominal"])
    assert resultado[0]["enfermedad"] == "Gastroenteritis"


def test_confianza_entre_0_y_100():
    """Verifica que todos los porcentajes de confianza estén entre 0 y 100"""
    resultado = calcular_diagnostico(["Tos", "Fiebre"])
    for r in resultado:
        assert 0 <= r["confianza"] <= 100


def test_diagnostico_sin_sintomas_conocidos():
    """Verifica el comportamiento cuando ningún síntoma coincide con la base de datos"""
    resultado = calcular_diagnostico(["SintomaInexistente123"])
    assert isinstance(resultado, list)


def test_estructura_resultado():
    """Verifica que cada resultado tenga los campos esperados"""
    resultado = calcular_diagnostico(["Tos", "Fiebre"])
    if len(resultado) > 0:
        primer_resultado = resultado[0]
        assert "enfermedad" in primer_resultado
        assert "confianza" in primer_resultado
        assert "sintomas_coincidentes" in primer_resultado