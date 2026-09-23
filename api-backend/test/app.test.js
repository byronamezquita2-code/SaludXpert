// Valores dummy para que @supabase/supabase-js pueda instanciar el cliente
// sin fallar al importar app.js. Ninguna de las pruebas de aquí llega a
// hacer una llamada real a Supabase (todas se detienen en la capa de auth
// o prueban funciones puras), así que no hace falta un proyecto real.
process.env.SUPABASE_URL ||= 'http://localhost:9999';
process.env.SUPABASE_KEY ||= 'test-anon-key';
process.env.SUPABASE_SERVICE_KEY ||= 'test-service-key';
process.env.ALLOWED_ORIGIN ||= 'http://127.0.0.1:5500';
process.env.INTERNAL_SECRET ||= 'test-internal-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, validarDatosPaciente } = require('../app');

test('GET / responde 200 con el mensaje de estado', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.equal(res.body.mensaje, 'API SaludXpert funcionando correctamente');
});

test('las rutas protegidas exigen autenticación (401 sin token)', async () => {
  const rutas = [
    ['get', '/api/sintomas'],
    ['get', '/api/enfermedades'],
    ['post', '/api/diagnosticar'],
    ['get', '/api/consultas'],
    ['get', '/api/pacientes'],
    ['post', '/api/pacientes'],
    ['get', '/api/usuarios/me'],
    ['get', '/api/usuarios'],
  ];

  for (const [metodo, ruta] of rutas) {
    const res = await request(app)[metodo](ruta);
    assert.equal(res.status, 401, `${metodo.toUpperCase()} ${ruta} debería exigir autenticación`);
  }
});

test('un token vacío o malformado también responde 401', async () => {
  const res = await request(app).get('/api/sintomas').set('Authorization', 'Bearer ');
  assert.equal(res.status, 401);
});

test('validarDatosPaciente exige un nombre de 1 a 200 caracteres', () => {
  assert.equal(
    validarDatosPaciente({ nombre: '' }),
    'Nombre inválido — debe tener entre 1 y 200 caracteres.'
  );
  assert.equal(
    validarDatosPaciente({ nombre: '   ' }),
    'Nombre inválido — debe tener entre 1 y 200 caracteres.'
  );
  assert.equal(
    validarDatosPaciente({ nombre: 'a'.repeat(201) }),
    'Nombre inválido — debe tener entre 1 y 200 caracteres.'
  );
  assert.equal(validarDatosPaciente({ nombre: 'Juan Pérez' }), null);
});

test('validarDatosPaciente rechaza un documento de más de 50 caracteres', () => {
  const error = validarDatosPaciente({ nombre: 'Juan', documento: 'x'.repeat(51) });
  assert.equal(error, 'Documento inválido — máximo 50 caracteres.');
});

test('validarDatosPaciente acepta campos clínicos ausentes o nulos', () => {
  assert.equal(
    validarDatosPaciente({ nombre: 'Juan', documento: null, alergias: undefined }),
    null
  );
});

test('validarDatosPaciente rechaza campos clínicos de más de 1000 caracteres', () => {
  const error = validarDatosPaciente({ nombre: 'Juan', alergias: 'x'.repeat(1001) });
  assert.equal(error, 'alergias inválido — máximo 1000 caracteres.');
});
