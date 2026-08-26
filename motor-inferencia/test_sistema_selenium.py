import time
import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

FRONTEND_URL = "http://127.0.0.1:5500/frontend/index.html"


@pytest.fixture
def driver():
    """Configura e inicia el navegador Chrome para cada prueba"""
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service)
    driver.get(FRONTEND_URL)
    yield driver
    driver.quit()


def test_pantalla_login_carga_correctamente(driver):
    """Verifica que la pantalla de login se muestre al iniciar"""
    login = driver.find_element(By.ID, "pantalla-login")
    assert "activa" in login.get_attribute("class")


def test_flujo_completo_diagnostico(driver):
    """
    Prueba de sistema: flujo completo de principio a fin.
    Login -> Captura de síntomas -> Resultado
    """
    wait = WebDriverWait(driver, 10)

    # 1. Login
    driver.find_element(By.ID, "correo").send_keys("byronamezquita2@gmail.com")
    driver.find_element(By.ID, "contrasena").send_keys("123456")
    driver.find_element(By.CSS_SELECTOR, "#form-login button").click()

    # 2. Esperar pantalla de síntomas
    wait.until(EC.visibility_of_element_located((By.ID, "pantalla-sintomas")))
    time.sleep(1)  # esperar a que carguen los síntomas desde la API

    # 3. Seleccionar síntomas típicos de Rinofaringitis
    botones = driver.find_elements(By.CLASS_NAME, "btn-sintoma")
    sintomas_deseados = ["Tos", "Dolor de garganta", "Congestión nasal"]

    for boton in botones:
        if boton.text in sintomas_deseados:
            boton.click()

    # 4. Verificar contador de síntomas
    contador = driver.find_element(By.ID, "contador-sintomas")
    assert "3 síntomas" in contador.text

    # 5. Presionar Analizar Síntomas
    driver.find_element(By.ID, "btn-analizar").click()

    # 6. Esperar pantalla de resultado
    wait.until(EC.visibility_of_element_located((By.ID, "pantalla-resultado")))
    time.sleep(1)

    # 7. Verificar que se muestre un diagnóstico
    resultado = driver.find_element(By.ID, "resultado-principal")
    assert "Rinofaringitis" in resultado.text


def test_validacion_sin_sintomas_seleccionados(driver):
    """Verifica que el sistema no permita analizar sin síntomas seleccionados"""
    wait = WebDriverWait(driver, 10)

    driver.find_element(By.ID, "correo").send_keys("byronamezquita2@gmail.com")
    driver.find_element(By.ID, "contrasena").send_keys("123456")
    driver.find_element(By.CSS_SELECTOR, "#form-login button").click()

    wait.until(EC.visibility_of_element_located((By.ID, "pantalla-sintomas")))
    time.sleep(1)

    # Intentar analizar sin seleccionar síntomas
    driver.find_element(By.ID, "btn-analizar").click()

    # Esperar y cerrar la alerta del navegador primero
    wait.until(EC.alert_is_present())
    alerta = driver.switch_to.alert
    texto_alerta = alerta.text
    alerta.accept()

    # Verificar que la alerta tenía el mensaje correcto
    assert "síntoma" in texto_alerta.lower()

    # Debe permanecer en la misma pantalla
    time.sleep(1)
    pantalla_sintomas = driver.find_element(By.ID, "pantalla-sintomas")
    assert "activa" in pantalla_sintomas.get_attribute("class")