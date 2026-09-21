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


def _login(driver, wait):
    """Helper: inicia sesión y espera a la pantalla de síntomas."""
    driver.find_element(By.ID, "correo").send_keys("byronamezquita2@gmail.com")
    driver.find_element(By.ID, "contrasena").send_keys("123456")
    driver.find_element(By.CSS_SELECTOR, "#form-login button").click()
    wait.until(EC.visibility_of_element_located((By.ID, "pantalla-sintomas")))
    time.sleep(1)  # esperar a que carguen los síntomas desde la API


def _cerrar_dialog(driver, wait):
    """Helper: espera a que aparezca el <dialog> modal y lo cierra con 'Aceptar'."""
    dialog = wait.until(EC.visibility_of_element_located((By.ID, "app-dialog")))
    btn_aceptar = dialog.find_element(By.ID, "dialog-confirm")
    btn_aceptar.click()
    wait.until(EC.invisibility_of_element_located((By.ID, "app-dialog")))


def test_pantalla_login_carga_correctamente(driver):
    """Verifica que la pantalla de login se muestre al iniciar"""
    login = driver.find_element(By.ID, "pantalla-login")
    assert "activa" in login.get_attribute("class")


def test_flujo_completo_diagnostico(driver):
    """
    Prueba de sistema: flujo completo de principio a fin.
    Login -> Captura de síntomas -> Resultado
    """
    wait = WebDriverWait(driver, 15)

    # 1. Login
    _login(driver, wait)

    # 2. Seleccionar síntomas típicos de Rinofaringitis
    botones = driver.find_elements(By.CLASS_NAME, "btn-sintoma")
    sintomas_deseados = ["Tos", "Dolor de garganta", "Congestión nasal"]

    for boton in botones:
        if boton.text in sintomas_deseados:
            boton.click()

    # 3. Verificar contador de síntomas
    contador = driver.find_element(By.ID, "contador-sintomas")
    assert "3 síntomas" in contador.text

    # 4. Presionar Analizar Síntomas
    driver.find_element(By.ID, "btn-analizar").click()

    # 5. Esperar pantalla de resultado
    wait.until(EC.visibility_of_element_located((By.ID, "pantalla-resultado")))
    time.sleep(1)

    # 6. Verificar que se muestre un diagnóstico
    resultado = driver.find_element(By.ID, "resultado-principal")
    assert "Rinofaringitis" in resultado.text


def test_validacion_sin_sintomas_seleccionados(driver):
    """Verifica que el sistema no permita analizar sin síntomas seleccionados.
    El sistema ahora muestra un <dialog> modal en lugar de alert() nativo."""
    wait = WebDriverWait(driver, 15)

    _login(driver, wait)

    # Intentar analizar sin seleccionar síntomas
    driver.find_element(By.ID, "btn-analizar").click()

    # Esperar el <dialog> modal (reemplaza el alert nativo)
    dialog = wait.until(EC.visibility_of_element_located((By.ID, "app-dialog")))

    # Verificar que el título o cuerpo del modal mencione "síntoma"
    titulo = dialog.find_element(By.ID, "dialog-title").text
    cuerpo = dialog.find_element(By.ID, "dialog-body").text
    texto_completo = (titulo + " " + cuerpo).lower()
    assert "síntoma" in texto_completo

    # Cerrar el modal
    dialog.find_element(By.ID, "dialog-confirm").click()
    wait.until(EC.invisibility_of_element_located((By.ID, "app-dialog")))

    # Debe permanecer en la misma pantalla
    pantalla_sintomas = driver.find_element(By.ID, "pantalla-sintomas")
    assert "activa" in pantalla_sintomas.get_attribute("class")


def test_confirmar_diagnostico(driver):
    """Verifica el flujo completo: seleccionar síntomas → analizar → confirmar."""
    wait = WebDriverWait(driver, 15)

    _login(driver, wait)

    # Seleccionar síntomas
    botones = driver.find_elements(By.CLASS_NAME, "btn-sintoma")
    for boton in botones:
        if boton.text in ["Tos", "Fiebre"]:
            boton.click()

    driver.find_element(By.ID, "btn-analizar").click()
    wait.until(EC.visibility_of_element_located((By.ID, "pantalla-resultado")))
    time.sleep(1)

    # Confirmar diagnóstico
    driver.find_element(By.ID, "btn-confirmar").click()

    # Debe aparecer el modal de confirmación
    dialog = wait.until(EC.visibility_of_element_located((By.ID, "app-dialog")))
    titulo = dialog.find_element(By.ID, "dialog-title").text
    assert "confirmado" in titulo.lower()

    # Cerrar y verificar que vuelve a la pantalla de síntomas
    _cerrar_dialog(driver, wait)
    time.sleep(1)
    pantalla = driver.find_element(By.ID, "pantalla-sintomas")
    assert "activa" in pantalla.get_attribute("class")


def test_login_credenciales_incorrectas(driver):
    """Verifica que credenciales incorrectas muestren mensaje de error."""
    wait = WebDriverWait(driver, 10)

    driver.find_element(By.ID, "correo").send_keys("noexiste@test.com")
    driver.find_element(By.ID, "contrasena").send_keys("wrongpassword")
    driver.find_element(By.CSS_SELECTOR, "#form-login button").click()

    # Esperar el mensaje de error
    error_msg = wait.until(EC.visibility_of_element_located((By.ID, "mensaje-error")))
    time.sleep(1)
    assert error_msg.text != ""

    # Debe permanecer en login
    login = driver.find_element(By.ID, "pantalla-login")
    assert "activa" in login.get_attribute("class")


def test_logout_regresa_a_login(driver):
    """Verifica que al cerrar sesión se regrese a la pantalla de login."""
    wait = WebDriverWait(driver, 15)

    _login(driver, wait)

    # Hacer logout
    btn_logout = driver.find_element(By.CSS_SELECTOR, ".btn-logout")
    btn_logout.click()
    time.sleep(1)

    # Verificar que estemos en login
    login = driver.find_element(By.ID, "pantalla-login")
    assert "activa" in login.get_attribute("class")