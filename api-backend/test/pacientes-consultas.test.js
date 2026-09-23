process.env.SUPABASE_URL ||= 'http://localhost:9999';
process.env.SUPABASE_KEY ||= 'test-anon-key';
process.env.SUPABASE_SERVICE_KEY ||= 'test-service-key';
process.env.ALLOWED_ORIGIN ||= 'http://127.0.0.1:5500';
process.env.INTERNAL_SECRET ||= 'test-internal-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');
const { createSupabaseStub } = require('./helpers/supabaseStub');

const AUTH_USER = { id: 'auth-1' };
const AUTH_HEADER = ['Authorization', 'Bearer token-valido'];

function appConTablas(tables) {
  const supabaseAdmin = createSupabaseStub({ user: AUTH_USER, tables });
  return createApp({ supabaseAdmin }).app;
}

test('GET /api/pacientes sin término de búsqueda no toca la base de datos', async () => {
  const app = appConTablas({});
  const res = await request(app).get('/api/pacientes').set(...AUTH_HEADER);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test('GET /api/pacientes con término devuelve los resultados del stub', async () => {
  const app = appConTablas({
    pacientes: { data: [{ id: 'p1', nombre: 'Ana López' }], error: null },
  });

  const res = await request(app).get('/api/pacientes?buscar=ana').set(...AUTH_HEADER);

  assert.equal(res.status, 200);
  assert.equal(res.body[0].nombre, 'Ana López');
});

test('POST /api/pacientes responde 400 si el nombre es inválido, sin llegar a Supabase', async () => {
  const app = appConTablas({}); // ninguna tabla configurada: si se llegara a consultar, el stub fallaría
  const res = await request(app)
    .post('/api/pacientes')
    .set(...AUTH_HEADER)
    .send({ nombre: '' });

  assert.equal(res.status, 400);
});

test('POST /api/pacientes registra un paciente válido', async () => {
  const app = appConTablas({
    pacientes: { data: [{ id: 'p1', nombre: 'Ana López' }], error: null },
  });

  const res = await request(app)
    .post('/api/pacientes')
    .set(...AUTH_HEADER)
    .send({ nombre: 'Ana López' });

  assert.equal(res.status, 200);
  assert.equal(res.body.id, 'p1');
});

test('PATCH /api/pacientes/:id responde 404 cuando no existe', async () => {
  const app = appConTablas({
    pacientes: { data: [], error: null },
  });

  const res = await request(app)
    .patch('/api/pacientes/no-existe')
    .set(...AUTH_HEADER)
    .send({ nombre: 'Ana López' });

  assert.equal(res.status, 404);
});

test('GET /api/pacientes/:id responde 404 cuando el paciente no existe', async () => {
  const app = appConTablas({
    pacientes: { data: null, error: { message: 'no encontrado' } },
  });

  const res = await request(app).get('/api/pacientes/no-existe').set(...AUTH_HEADER);

  assert.equal(res.status, 404);
});

test('GET /api/pacientes/:id devuelve el paciente con sus consultas', async () => {
  const app = appConTablas({
    pacientes: { data: { id: 'p1', nombre: 'Ana López' }, error: null },
    consultas: { data: [{ id: 'c1', sintomas_ingresados: ['Tos'] }], error: null },
  });

  const res = await request(app).get('/api/pacientes/p1').set(...AUTH_HEADER);

  assert.equal(res.status, 200);
  assert.equal(res.body.nombre, 'Ana López');
  assert.equal(res.body.consultas.length, 1);
});

test('POST /api/diagnosticar responde 400 sin síntomas', async () => {
  const app = appConTablas({});
  const res = await request(app)
    .post('/api/diagnosticar')
    .set(...AUTH_HEADER)
    .send({ sintomas: [], paciente_id: 'p1' });

  assert.equal(res.status, 400);
});

test('POST /api/diagnosticar responde 400 sin paciente_id', async () => {
  const app = appConTablas({});
  const res = await request(app)
    .post('/api/diagnosticar')
    .set(...AUTH_HEADER)
    .send({ sintomas: ['Tos'] });

  assert.equal(res.status, 400);
});

test('POST /api/diagnosticar responde 400 cuando el paciente no existe', async () => {
  const app = appConTablas({
    pacientes: { data: null, error: { message: 'no encontrado' } },
  });

  const res = await request(app)
    .post('/api/diagnosticar')
    .set(...AUTH_HEADER)
    .send({ sintomas: ['Tos'], paciente_id: 'no-existe' });

  assert.equal(res.status, 400);
});
