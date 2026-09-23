import os
import sentry_sdk
from flask import Flask, request, jsonify, abort
from flask_cors import CORS
from sentry_sdk.integrations.flask import FlaskIntegration
from motor import calcular_diagnostico

# Sin SENTRY_DSN el SDK queda inicializado pero no envía nada — seguro de
# dejar siempre activo, incluso en local/tests.
sentry_sdk.init(
    dsn=os.environ.get("SENTRY_DSN"),
    environment=os.environ.get("FLASK_ENV", "development"),
    integrations=[FlaskIntegration()],
    traces_sample_rate=0,
)

app = Flask(__name__)

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
CORS(app, origins=ALLOWED_ORIGINS)

INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "")

if not INTERNAL_SECRET:
    raise RuntimeError(
        "INTERNAL_SECRET no está configurado. El motor de inferencia no "
        "debe arrancar sin este secreto — configúralo en el .env (local) "
        "o en las variables de entorno del servicio en Render (producción)."
    )


def _verificar_secret():
    token = request.headers.get("X-Internal-Secret", "")
    if token != INTERNAL_SECRET:
        abort(403)


@app.route("/")
def inicio():
    return jsonify({"mensaje": "Motor de Inferencia SaludXpert funcionando correctamente"})


@app.route("/api/diagnosticar", methods=["POST"])
def diagnosticar():
    _verificar_secret()

    try:
        datos = request.get_json()
        sintomas = datos.get("sintomas", [])

        if not sintomas:
            return jsonify({"error": "Debe proporcionar al menos un síntoma"}), 400

        resultados = calcular_diagnostico(sintomas)

        confianza_suficiente = bool(resultados and resultados[0]["confianza"] >= 60)

        return jsonify({
            "sintomas_ingresados": sintomas,
            "diagnosticos": resultados[:5],
            "confianza_suficiente": confianza_suficiente,
        })

    except Exception as e:
        sentry_sdk.capture_exception(e)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)