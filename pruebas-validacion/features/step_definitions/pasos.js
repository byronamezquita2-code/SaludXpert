require('dotenv').config();
const { Given, When, Then, Before } = require('@cucumber/cucumber');
const assert = require('assert');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const API_URL = process.env.TEST_API_URL || 'http://localhost:3000';

const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!TEST_EMAIL || !TEST_PASSWORD || !SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'Faltan variables de entorno para las pruebas (TEST_EMAIL, TEST_PASSWORD, ' +
    'SUPABASE_URL, SUPABASE_KEY). Revisa pruebas-validacion/.env'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const NOMBRE_PACIENTE_PRUEBA = 'Paciente Prueba BDD';

let respuestaActual = null;
let authToken = null;
let pacientePruebaId = null;

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

function apiAuth() {
  return axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

async function obtenerPacientePrueba() {
  if (pacientePruebaId) return pacientePruebaId;

  const busqueda = await apiAuth().get('/api/pacientes', { params: { buscar: NOMBRE_PACIENTE_PRUEBA } });
  const existente = busqueda.data.find(p => p.nombre === NOMBRE_PACIENTE_PRUEBA);
  if (existente) {
    pacientePruebaId = existente.id;
    return pacientePruebaId;
  }

  const creado = await apiAuth().post('/api/pacientes', { nombre: NOMBRE_PACIENTE_PRUEBA });
  pacientePruebaId = creado.data.id;
  return pacientePruebaId;
}

Given('que el sistema está disponible', async function () {
  const response = await axios.get(`${API_URL}/`);
  assert.strictEqual(response.status, 200);
});

When('el personal envía los síntomas {string}', async function (sintomasTexto) {
  const sintomas = sintomasTexto.split(',').map(s => s.trim());
  const paciente_id = await obtenerPacientePrueba();
  const response = await apiAuth().post('/api/diagnosticar', { sintomas, paciente_id });
  respuestaActual = response.data;
});

When('el personal envía un único síntoma {string}', async function (sintoma) {
  const paciente_id = await obtenerPacientePrueba();
  const response = await apiAuth().post('/api/diagnosticar', { sintomas: [sintoma], paciente_id });
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