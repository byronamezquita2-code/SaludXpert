const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');
const axios = require('axios');

const API_URL = 'http://localhost:3000';
let respuestaActual = null;

Given('que el sistema está disponible', async function () {
  const response = await axios.get(`${API_URL}/`);
  assert.strictEqual(response.status, 200);
});

When('el personal envía los síntomas {string}', async function (sintomasTexto) {
  const sintomas = sintomasTexto.split(',').map(s => s.trim());
  const response = await axios.post(`${API_URL}/api/diagnosticar`, { sintomas });
  respuestaActual = response.data;
});

When('el personal envía un único síntoma {string}', async function (sintoma) {
  const response = await axios.post(`${API_URL}/api/diagnosticar`, { sintomas: [sintoma] });
  respuestaActual = response.data;
});

When('el médico solicita el historial de consultas', async function () {
  const response = await axios.get(`${API_URL}/api/consultas`);
  respuestaActual = response.data;
});

When('se solicita la lista de síntomas', async function () {
  const response = await axios.get(`${API_URL}/api/sintomas`);
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