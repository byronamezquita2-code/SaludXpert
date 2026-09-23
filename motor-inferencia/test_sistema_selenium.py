import os
import time
import pytest
from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

load_dotenv()

FRONTEND_URL = "http://127.0.0.1:5500/frontend/index.html"
NOMBRE_PACIENTE_PRUEBA = "Paciente Prueba Selenium"

TEST_EMAIL = os.environ.get("TEST_EMAIL")
TEST_PASSWORD = os.environ.get("TEST_PASSWORD")

if not TEST_EMAIL or not TEST_PASSWORD:
    raise RuntimeError(
        "Faltan TEST_EMAIL / TEST_PASSWORD en el entorno. "
        "Configúralas en motor-inferencia/.env antes de correr estas pruebas."
    )


@pytest.fixture
def driver():
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service)
    driver.get(FRONTEND_URL)
    yield driver
    driver.quit()


def _login(driver, wait):
    driver.find_element(By.ID, "correo").send_keys(TEST_EMAIL)
    driver.find_element(By.ID, "contrasena").send_keys(TEST_PASSWORD)
    driver.find_element(By.CSS_SELECTOR, "#form-login button").click()
    wait.until(EC.visibility_of_element_located((By.ID, "pantalla-paciente")))
    _seleccionar_paciente(driver, wait)
    wait.until(EC.visibility_of_element_located((By.ID, "pantalla-sintomas")))
    time.sleep(1)


def _seleccionar_paciente(driver, wait):
    driver.find_element(By.ID, "buscar-paciente").send_keys(NOMBRE_PACIENTE_PRUEBA)
    time.sleep(1.5)
    resultados = driver.find_elements(By.CSS_SELECTOR, "#resultados-paciente .resultado-paciente")
    if resultados:
        resultados[0].click()
        return
    driver.find_element(By.ID, "paciente-nombre").send_keys(NOMBRE_PACIENTE_PRUEBA)
    driver.find_element(By.ID, "btn-guardar-paciente").click()


def _cerrar_dialog(driver, wait):
    dialog = wait.until(EC.visibility_of_element_located((By.ID, "app-dialog")))
    btn_aceptar = dialog.find_element(By.ID, "dialog-confirm")
    btn_aceptar.click()
    wait.until(EC.invisibility_of_element_located((By.ID, "app-dialog")))


def test_pantalla_login_carga_correctamente(driver):
    login = driver.find_element(By.ID, "pantalla-login")
    assert "activa" in login.get_attribute("class")


def test_flujo_completo_diagnostico(driver):
    wait = WebDriverWait(driver, 15)

    _login(driver, wait)

    botones = driver.find_elements(By.CLASS_NAME, "btn-sintoma")
    sintomas_deseados = ["Tos", "Dolor de garganta", "Congestión nasal"]

    for boton in botones:
        if boton.text in sintomas_deseados:
            boton.click()

    contador = driver.find_element(By.ID, "contador-sintomas")
    assert "3 síntomas" in contador.text

    driver.find_element(By.ID, "btn-analizar").click()

    wait.until(EC.visibility_of_element_located((By.ID, "pantalla-resultado")))
    time.sleep(1)

    resultado = driver.find_element(By.ID, "resultado-principal")
    assert "Rinofaringitis" in resultado.text


def test_validacion_sin_sintomas_seleccionados(driver):
    wait = WebDriverWait(driver, 15)

    _login(driver, wait)

    driver.find_element(By.ID, "btn-analizar").click()

    dialog = wait.until(EC.visibility_of_element_located((By.ID, "app-dialog")))

    titulo = dialog.find_element(By.ID, "dialog-title").text
    cuerpo = dialog.find_element(By.ID, "dialog-body").text
    texto_completo = (titulo + " " + cuerpo).lower()
    assert "síntoma" in texto_completo

    dialog.find_element(By.ID, "dialog-confirm").click()
    wait.until(EC.invisibility_of_element_located((By.ID, "app-dialog")))

    pantalla_sintomas = driver.find_element(By.ID, "pantalla-sintomas")
    assert "activa" in pantalla_sintomas.get_attribute("class")


def test_confirmar_diagnostico(driver):
    wait = WebDriverWait(driver, 15)

    _login(driver, wait)

    botones = driver.find_elements(By.CLASS_NAME, "btn-sintoma")
    for boton in botones:
        if boton.text in ["Tos", "Fiebre"]:
            boton.click()

    driver.find_element(By.ID, "btn-analizar").click()
    wait.until(EC.visibility_of_element_located((By.ID, "pantalla-resultado")))
    time.sleep(1)

    driver.find_element(By.ID, "btn-confirmar").click()

    dialog = wait.until(EC.visibility_of_element_located((By.ID, "app-dialog")))
    titulo = dialog.find_element(By.ID, "dialog-title").text
    assert "confirmado" in titulo.lower()

    _cerrar_dialog(driver, wait)
    time.sleep(1)
    pantalla = driver.find_element(By.ID, "pantalla-sintomas")
    assert "activa" in pantalla.get_attribute("class")


def test_login_credenciales_incorrectas(driver):
    wait = WebDriverWait(driver, 10)

    driver.find_element(By.ID, "correo").send_keys("noexiste@test.com")
    driver.find_element(By.ID, "contrasena").send_keys("wrongpassword")
    driver.find_element(By.CSS_SELECTOR, "#form-login button").click()

    error_msg = wait.until(EC.visibility_of_element_located((By.ID, "mensaje-error")))
    time.sleep(1)
    assert error_msg.text != ""

    login = driver.find_element(By.ID, "pantalla-login")
    assert "activa" in login.get_attribute("class")


def test_logout_regresa_a_login(driver):
    wait = WebDriverWait(driver, 15)

    _login(driver, wait)

    btn_logout = driver.find_element(By.CSS_SELECTOR, ".btn-logout")
    btn_logout.click()
    time.sleep(1)

    login = driver.find_element(By.ID, "pantalla-login")
    assert "activa" in login.get_attribute("class")
