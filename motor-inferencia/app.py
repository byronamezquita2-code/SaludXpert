import os
from flask import Flask, request, jsonify, abort
from flask_cors import CORS
from motor import calcular_diagnostico

app = Flask(__name__)

# Solo el backend de Node puede llamar a este motor.
# El origin del motor no debería recibir peticiones del navegador directamente.
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
CORS(app, origins=ALLOWED_ORIGINS)

# Secret compartido con el backend de Node para que solo él pueda invocar este servicio.
INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "")


def _verificar_secret():
    """Rechaza peticiones que no incluyan el secret interno correcto."""
    if INTERNAL_SECRET:
        token = request.headers.get("X-Internal-Secret", "")
        if token != INTERNAL_SECRET:
            abort(403)


@app.route("/")
def inicio():
    return jsonify({"mensaje": "Motor de Inferencia SaludXpert funcionando correctamente"})


@app.route("/api/diagnosticar", methods=["POST"])
def diagnosticar():
    """
    Recibe un JSON con la lista de síntomas y retorna el diagnóstico.
    Solo acepta peticiones del backend Node (validado por X-Internal-Secret).

    Ejemplo de entrada:
    {
        "sintomas": ["Tos", "Fiebre", "Dolor de garganta"]
    }
    """
    _verificar_secret()

    try:
        datos = request.get_json()
        sintomas = datos.get("sintomas", [])

        if not sintomas:
            return jsonify({"error": "Debe proporcionar al menos un síntoma"}), 400

        resultados = calcular_diagnostico(sintomas)

        # Determinar si la confianza es suficiente (>= 60%)
        confianza_suficiente = bool(resultados and resultados[0]["confianza"] >= 60)

        return jsonify({
            "sintomas_ingresados": sintomas,
            "diagnosticos": resultados[:5],   # top 5 resultados
            "confianza_suficiente": confianza_suficiente,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)