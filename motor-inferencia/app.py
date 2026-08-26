from flask import Flask, request, jsonify
from flask_cors import CORS
from motor import calcular_diagnostico

app = Flask(__name__)
CORS(app)


@app.route('/')
def inicio():
    return jsonify({"mensaje": "Motor de Inferencia SaludXpert funcionando correctamente"})


@app.route('/api/diagnosticar', methods=['POST'])
def diagnosticar():
    """
    Recibe un JSON con la lista de síntomas y retorna el diagnóstico.
    Ejemplo de entrada:
    {
        "sintomas": ["Tos", "Fiebre", "Dolor de garganta"]
    }
    """
    try:
        datos = request.get_json()
        sintomas = datos.get("sintomas", [])

        if not sintomas:
            return jsonify({"error": "Debe proporcionar al menos un síntoma"}), 400

        resultados = calcular_diagnostico(sintomas)

        # Determinar si la confianza es suficiente (>= 60%)
        confianza_suficiente = False
        if resultados:
            confianza_suficiente = resultados[0]["confianza"] >= 60

        return jsonify({
            "sintomas_ingresados": sintomas,
            "diagnosticos": resultados[:5],  # top 5 resultados
            "confianza_suficiente": confianza_suficiente
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)