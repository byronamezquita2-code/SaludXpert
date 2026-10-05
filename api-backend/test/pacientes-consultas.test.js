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
const AUTH_HEADER = ['Authorization', 'Bearer x.eyJhYWwiOiJhYWwyIn0.firma'];

const UUID = '11111111-1111-4111-8111-111111111111';
const USUARIO_ENFERMERIA = { data: { id: 'u1', nombre: 'Ana', correo: 'ana@salud.gob.gt', rol: 'enfermeria', activo: true }, error: null };

function appConTablas(tables) {
  const supabaseAdmin = createSupabaseStub({ user: AUTH_USER, tables: { usuarios: USUARIO_ENFERMERIA, ...tables } });
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
    .patch(`/api/pacientes/${UUID}`)
    .set(...AUTH_HEADER)
    .send({ nombre: 'Ana López' });

  assert.equal(res.status, 404);
});

test('GET /api/pacientes/:id responde 404 cuando el paciente no existe', async () => {
  const app = appConTablas({
    pacientes: { data: null, error: null },
  });

  const res = await request(app).get(`/api/pacientes/${UUID}`).set(...AUTH_HEADER);

  assert.equal(res.status, 404);
});

test('GET /api/pacientes/:id devuelve el paciente con sus consultas', async () => {
  const app = appConTablas({
    pacientes: { data: { id: UUID, nombre: 'Ana López' }, error: null },
    consultas: { data: [{ id: 'c1', sintomas_ingresados: ['Tos'] }], error: null },
  });

  const res = await request(app).get(`/api/pacientes/${UUID}`).set(...AUTH_HEADER);

  assert.equal(res.status, 200);
  assert.equal(res.body.nombre, 'Ana López');
  assert.equal(res.body.consultas.length, 1);
});

test('POST /api/diagnosticar responde 400 sin síntomas', async () => {
  const app = appConTablas({});
  const res = await request(app)
    .post('/api/diagnosticar')
    .set(...AUTH_HEADER)
    .send({ sintomas: [], paciente_id: UUID });

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
    pacientes: { data: null, error: null },
  });

  const res = await request(app)
    .post('/api/diagnosticar')
    .set(...AUTH_HEADER)
    .send({ sintomas: ['Tos'], paciente_id: UUID });

  assert.equal(res.status, 400);
});

const USUARIO_MEDICO = { data: { id: 'u2', nombre: 'Luis', correo: 'luis@salud.gob.gt', rol: 'medico', activo: true }, error: null };

function stubConMedico(tables) {
  return createSupabaseStub({
    user: AUTH_USER,
    tables: { usuarios: USUARIO_MEDICO, auditoria: { data: null, error: null }, ...tables },
  });
}

test('GET /api/pacientes?todos=true devuelve el listado con el total de consultas', async () => {
  const app = appConTablas({
    pacientes: { data: [
      { id: 'p1', nombre: 'Ana López', consultas: [{ count: 2 }] },
      { id: 'p2', nombre: 'Beto Pérez', consultas: [{ count: 0 }] },
    ], error: null },
  });

  const res = await request(app).get('/api/pacientes?todos=true').set(...AUTH_HEADER);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map(p => [p.nombre, p.total_consultas]), [['Ana López', 2], ['Beto Pérez', 0]]);
  assert.equal(res.body[0].consultas, undefined);
});

test('DELETE /api/pacientes/:id está prohibido para enfermería', async () => {
  const app = appConTablas({});
  const res = await request(app).delete(`/api/pacientes/${UUID}`).set(...AUTH_HEADER);

  assert.equal(res.status, 403);
});

test('DELETE /api/pacientes/:id rechaza un identificador inválido', async () => {
  const app = createApp({ supabaseAdmin: stubConMedico({}) }).app;
  const res = await request(app).delete('/api/pacientes/no-es-uuid').set(...AUTH_HEADER);

  assert.equal(res.status, 400);
});

test('DELETE /api/pacientes/:id borra al paciente y deja auditoría con sus consultas', async () => {
  const supabaseAdmin = stubConMedico({
    consultas: { count: 3, error: null },
    pacientes: { data: [{ id: UUID, nombre: 'Ana López', documento: '123' }], error: null },
  });
  const app = createApp({ supabaseAdmin }).app;

  const res = await request(app).delete(`/api/pacientes/${UUID}`).set(...AUTH_HEADER);

  assert.equal(res.status, 200);
  assert.equal(res.body.consultas_eliminadas, 3);
  const auditoria = supabaseAdmin.inserts.find(i => i.table === 'auditoria');
  assert.equal(auditoria.filas[0].accion, 'paciente_eliminado');
  assert.equal(auditoria.filas[0].objetivo_id, UUID);
  assert.deepEqual(auditoria.filas[0].detalle, { nombre: 'Ana López', documento: '123', consultas_eliminadas: 3 });
});

test('DELETE /api/pacientes/:id responde 404 si el paciente no existe', async () => {
  const app = createApp({ supabaseAdmin: stubConMedico({
    consultas: { count: 0, error: null },
    pacientes: { data: [], error: null },
  }) }).app;

  const res = await request(app).delete(`/api/pacientes/${UUID}`).set(...AUTH_HEADER);

  assert.equal(res.status, 404);
});

test('DELETE /api/pacientes/:id responde 409 si falta la migración 011', async () => {
  const app = createApp({ supabaseAdmin: stubConMedico({
    consultas: { count: 1, error: null },
    pacientes: { data: null, error: { code: '23503', message: 'fk' } },
  }) }).app;

  const res = await request(app).delete(`/api/pacientes/${UUID}`).set(...AUTH_HEADER);

  assert.equal(res.status, 409);
});
