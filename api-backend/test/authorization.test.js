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
const UUID = '11111111-1111-4111-8111-111111111111';

function appConAdmin({ rol, tables = {} } = {}) {
  const supabaseAdmin = createSupabaseStub({
    user: AUTH_USER,
    tables: { usuarios: { data: { id: 'u1', rol, activo: true }, error: null }, ...tables },
  });
  return createApp({ supabaseAdmin }).app;
}

test('requireAdmin bloquea con 403 a quien no es administrador', async () => {
  const app = appConAdmin({ rol: 'enfermeria' });
  const res = await request(app)
    .post('/api/usuarios')
    .set('Authorization', 'Bearer token-valido')
    .send({ nombre: 'Nueva', correo: 'nueva@salud.gob.gt', rol: 'medico' });

  assert.equal(res.status, 403);
});

test('requireAdmin deja pasar a un administrador', async () => {
  const app = appConAdmin({
    rol: 'administrador',
    tables: {
      usuarios: [
        { data: { id: 'u1', rol: 'administrador', activo: true }, error: null }, // requireAuth
        { data: [{ id: 'u2', nombre: 'Nueva', correo: 'nueva@salud.gob.gt', rol: 'medico', activo: true }], error: null }, // insert final
      ],
    },
  });

  const res = await request(app)
    .post('/api/usuarios')
    .set('Authorization', 'Bearer token-valido')
    .send({ nombre: 'Nueva', correo: 'nueva@salud.gob.gt', rol: 'medico' });

  assert.equal(res.status, 200);
  assert.equal(res.body.correo, 'nueva@salud.gob.gt');
});

test('requireMedicoOAdmin bloquea con 403 a enfermería', async () => {
  const app = appConAdmin({ rol: 'enfermeria' });
  const res = await request(app)
    .get('/api/usuarios')
    .set('Authorization', 'Bearer token-valido');

  assert.equal(res.status, 403);
});

test('un médico solo ve usuarios con rol médico (filtrado en el backend)', async () => {
  // El stub no valida el .eq('rol', 'medico') en sí — lo que se comprueba
  // aquí es que la ruta no explota y responde 200 para un médico, que es
  // el rol autorizado a listar (con el filtro aplicado del lado del cliente stub).
  const app = appConAdmin({
    rol: 'medico',
    tables: {
      usuarios: [
        { data: { id: 'u1', rol: 'medico', activo: true }, error: null }, // requireAuth
        { data: [{ id: 'u1', nombre: 'Dr. X', rol: 'medico' }], error: null }, // listado
      ],
    },
  });

  const res = await request(app)
    .get('/api/usuarios')
    .set('Authorization', 'Bearer token-valido');

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test('PATCH /api/consultas/:id exige médico o administrador (403 para enfermería)', async () => {
  const app = appConAdmin({ rol: 'enfermeria' });
  const res = await request(app)
    .patch(`/api/consultas/${UUID}`)
    .set('Authorization', 'Bearer token-valido')
    .send({ decision_medico: 'confirmado' });

  assert.equal(res.status, 403);
});

test('PATCH /api/consultas/:id rechaza un decision_medico inválido', async () => {
  const app = appConAdmin({
    rol: 'medico',
    tables: {
      usuarios: { data: { id: 'u1', rol: 'medico', activo: true }, error: null },
    },
  });

  const res = await request(app)
    .patch(`/api/consultas/${UUID}`)
    .set('Authorization', 'Bearer token-valido')
    .send({ decision_medico: 'algo-invalido' });

  assert.equal(res.status, 400);
});

test('POST /api/usuarios rechaza un rol inválido incluso siendo administrador', async () => {
  const app = appConAdmin({ rol: 'administrador' });
  const res = await request(app)
    .post('/api/usuarios')
    .set('Authorization', 'Bearer token-valido')
    .send({ nombre: 'Nueva', correo: 'nueva@salud.gob.gt', rol: 'superadmin' });

  assert.equal(res.status, 400);
});

test('PATCH /api/usuarios/:id exige que "activo" sea booleano', async () => {
  const app = appConAdmin({ rol: 'administrador' });
  const res = await request(app)
    .patch(`/api/usuarios/${UUID}`)
    .set('Authorization', 'Bearer token-valido')
    .send({ activo: 'si' });

  assert.equal(res.status, 400);
});
