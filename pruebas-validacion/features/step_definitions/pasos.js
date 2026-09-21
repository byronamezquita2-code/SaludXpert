const { Given, When, Then, Before } = require('@cucumber/cucumber');
const assert = require('assert');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const API_URL = 'http://localhost:3000';

// Credenciales de prueba — deben existir en Supabase Auth
const TEST_EMAIL = 'byronamezquita2@gmail.com';
const TEST_PASSWORD = '123456';

// Supabase client para obtener el JWT
const SUPABASE_URL = 'https://bpisojfqhsaisfvnwhpr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_I0o7hKokgpc5hyIcBZeRQg_nLHEm60L';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let respuestaActual = null;
let authToken = null;

// ── Obtener JWT antes de los escenarios ───────────────────────────────────────
Before(async function () {
  if (!authToken) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    if (error) throw new Error(`No se pudo autenticar para los tests: ${error.message}`);
    authToken = data.session.access_token;
  }
});

// Helper: petición autenticada
function apiAuth() {
  return axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

// ── Steps ─────────────────────────────────────────────────────────────────────

Given('que el sistema está disponible', async function () {
  // La ruta raíz no requiere auth
  const response = await axios.get(`${API_URL}/`);
  assert.strictEqual(response.status, 200);
});

When('el personal envía los síntomas {string}', async function (sintomasTexto) {
  const sintomas = sintomasTexto.split(',').map(s => s.trim());
  const response = await apiAuth().post('/api/diagnosticar', { sintomas });
  respuestaActual = response.data;
});

When('el personal envía un único síntoma {string}', async function (sintoma) {
  const response = await apiAuth().post('/api/diagnosticar', { sintomas: [sintoma] });
  respuestaActual = response.data;
});

When('el médico solicita el historial de consultas', async function () {
  const response = await apiAuth().get('/api/consultas');
  respuestaActual = response.data;
});

When('se solicita la lista de síntomas', async function () {
  const response = await apiAuth().get('/api/sintomas');
  respuestaActual = response.data;
});

Then('el sistema debe retornar una lista de diagnósticos', function () {
  assert.ok(Array.isArray(respuestaActual.diagnosticos));
  assert.ok(respuestaActual.diagnosticos.length > 0);
});

Then('el diagnóstico principal debe ser {string}', function (enfermedadEsperada) {
  assert.strictEqual(respuestaActual.diagnosticos[0].enfermedad, enfermedadEsperada);
});

Then('el sistema debe indicar que la confianza no es suficiente', function () {
  assert.strictEqual(respuestaActual.confianza_suficiente, false);
});

Then('el sistema debe retornar al menos una consulta registrada', function () {
  assert.ok(Array.isArray(respuestaActual));
  assert.ok(respuestaActual.length > 0);
});

Then('el sistema debe retornar exactamente {int} síntomas', function (cantidad) {
  assert.strictEqual(respuestaActual.length, cantidad);
});