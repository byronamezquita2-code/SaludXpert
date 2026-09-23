process.env.SUPABASE_URL ||= 'http://localhost:9999';
process.env.SUPABASE_KEY ||= 'test-anon-key';
process.env.SUPABASE_SERVICE_KEY ||= 'test-service-key';
process.env.ALLOWED_ORIGIN ||= 'http://127.0.0.1:5500';
process.env.INTERNAL_SECRET ||= 'test-internal-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const request = require('supertest');
const { createApp, validarDatosPaciente } = require('../app');
const { createSupabaseStub } = require('./helpers/supabaseStub');

const UUID = '11111111-1111-4111-8111-111111111111';
const AUTH = ['Authorization', 'Bearer token-valido'];

const usuario = (extra = {}) => ({
  data: { id: UUID, nombre: 'Ana', correo: 'ana@salud.gob.gt', rol: 'enfermeria', activo: true, ...extra },
  error: null,
});

function crearApp({ tables = {}, user = { id: 'auth-1' }, stubExtra = {} } = {}) {
  const supabaseAdmin = createSupabaseStub({ user, tables: { usuarios: usuario(), ...tables }, ...stubExtra });
  return createApp({ supabaseAdmin }).app;
}

async function conMotor(respuesta, fn) {
  const original = axios.post;
  axios.post = typeof respuesta === 'function' ? respuesta : async () => ({ data: respuesta });
  try {
    await fn();
  } finally {
    axios.post = original;
  }
}

test('un usuario autenticado en Supabase Auth pero sin fila en "usuarios" recibe 403', async () => {
  const app = crearApp({ tables: { usuarios: { data: null, error: null } } });
  const res = await request(app).get('/api/pacientes?buscar=ana').set(...AUTH);

  assert.equal(res.status, 403);
  assert.equal(res.body.codigo, 'sin_registro');
});

test('un usuario desactivado (activo=false) recibe 403 en cualquier ruta protegida', async () => {
  const app = crearApp({ tables: { usuarios: usuario({ activo: false }) } });

  for (const ruta of ['/api/sintomas', '/api/consultas', '/api/pacientes?buscar=ana', '/api/usuarios/me']) {
    const res = await request(app).get(ruta).set(...AUTH);
    assert.equal(res.status, 403, ruta);
    assert.equal(res.body.codigo, 'cuenta_inactiva', ruta);
  }
});

test('activo=null tampoco se trata como cuenta activa', async () => {
  const app = crearApp({ tables: { usuarios: usuario({ activo: null }) } });
  const res = await request(app).get('/api/sintomas').set(...AUTH);

  assert.equal(res.status, 403);
});

test('un error de base de datos al verificar la cuenta responde 500, no deja pasar', async () => {
  const app = crearApp({ tables: { usuarios: { data: null, error: { message: 'db caída' } } } });
  const res = await request(app).get('/api/sintomas').set(...AUTH);

  assert.equal(res.status, 500);
});

test('GET /api/usuarios/me devuelve el perfil de quien hace la petición', async () => {
  const app = crearApp();
  const res = await request(app).get('/api/usuarios/me').set(...AUTH);

  assert.equal(res.status, 200);
  assert.equal(res.body.rol, 'enfermeria');
  assert.equal(res.body.id, UUID);
});

test('un administrador no puede desactivar su propia cuenta', async () => {
  const app = crearApp({ tables: { usuarios: usuario({ rol: 'administrador' }) } });
  const res = await request(app)
    .patch(`/api/usuarios/${UUID}`)
    .set(...AUTH)
    .send({ activo: false });

  assert.equal(res.status, 400);
});

test('PATCH /api/usuarios/:id responde 404 si el usuario no existe', async () => {
  const otro = '22222222-2222-4222-8222-222222222222';
  const app = crearApp({
    tables: {
      usuarios: [usuario({ rol: 'administrador' }), { data: [], error: null }],
    },
  });
  const res = await request(app)
    .patch(`/api/usuarios/${otro}`)
    .set(...AUTH)
    .send({ activo: false });

  assert.equal(res.status, 404);
});

test('los identificadores que no son UUID responden 400 en vez de llegar a la base', async () => {
  const app = crearApp({ tables: { usuarios: usuario({ rol: 'administrador' }) } });

  const rutas = [
    ['patch', '/api/pacientes/abc', { nombre: 'Ana' }],
    ['get', '/api/pacientes/abc'],
    ['patch', '/api/consultas/abc', { decision_medico: 'confirmado' }],
    ['patch', '/api/usuarios/abc', { activo: true }],
  ];

  for (const [metodo, ruta, cuerpo] of rutas) {
    const res = await request(app)[metodo](ruta).set(...AUTH).send(cuerpo);
    assert.equal(res.status, 400, `${metodo.toUpperCase()} ${ruta}`);
  }
});

test('crear un usuario con correo repetido responde 409 y limpia la cuenta de Auth creada', async () => {
  let eliminado = null;
  const app = crearApp({
    tables: {
      usuarios: [
        usuario({ rol: 'administrador' }),
        { data: null, error: { code: '23505', message: 'duplicate key' } },
      ],
    },
    stubExtra: { deleteUser: async (id) => { eliminado = id; return { data: null, error: null }; } },
  });

  const res = await request(app)
    .post('/api/usuarios')
    .set(...AUTH)
    .send({ nombre: 'Nueva', correo: 'nueva@salud.gob.gt', rol: 'medico' });

  assert.equal(res.status, 409);
  assert.equal(eliminado, 'auth-nuevo');
});

test('las respuestas de /api no se cachean y no revelan Express', async () => {
  const app = crearApp();
  const res = await request(app).get('/api/sintomas').set(...AUTH);

  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('POST /api/diagnosticar rechaza una lista de síntomas malformada', async () => {
  const app = crearApp();

  for (const sintomas of ['Tos', [123], [''], ['x'.repeat(101)], Array(51).fill('Tos'), [{ a: 1 }]]) {
    const res = await request(app)
      .post('/api/diagnosticar')
      .set(...AUTH)
      .send({ sintomas, paciente_id: UUID });
    assert.equal(res.status, 400, JSON.stringify(sintomas).slice(0, 40));
  }
});

test('POST /api/diagnosticar guarda la consulta a nombre de quien la hace y devuelve su id', async () => {
  const app = crearApp({
    tables: {
      pacientes: { data: { id: UUID }, error: null },
      consultas: { data: [{ id: 'c-nueva' }], error: null },
    },
  });

  await conMotor({ diagnosticos: [{ enfermedad: 'Rinofaringitis', confianza: 90 }], confianza_suficiente: true }, async () => {
    const res = await request(app)
      .post('/api/diagnosticar')
      .set(...AUTH)
      .send({ sintomas: ['Tos'], paciente_id: UUID });

    assert.equal(res.status, 200);
    assert.equal(res.body.consulta_id, 'c-nueva');
    assert.equal(res.body.diagnosticos[0].enfermedad, 'Rinofaringitis');
  });
});

test('si no se puede guardar la consulta, NO se devuelve el diagnóstico como si estuviera registrado', async () => {
  const app = crearApp({
    tables: {
      pacientes: { data: { id: UUID }, error: null },
      consultas: { data: null, error: { message: 'insert falló' } },
    },
  });

  await conMotor({ diagnosticos: [] }, async () => {
    const res = await request(app)
      .post('/api/diagnosticar')
      .set(...AUTH)
      .send({ sintomas: ['Tos'], paciente_id: UUID });

    assert.equal(res.status, 500);
    assert.equal(res.body.consulta_id, undefined);
  });
});

test('si el motor de inferencia no responde, la API responde 503 con un mensaje claro', async () => {
  const app = crearApp({ tables: { pacientes: { data: { id: UUID }, error: null } } });

  await conMotor(async () => { throw new Error('ECONNREFUSED'); }, async () => {
    const res = await request(app)
      .post('/api/diagnosticar')
      .set(...AUTH)
      .send({ sintomas: ['Tos'], paciente_id: UUID });

    assert.equal(res.status, 503);
  });
});

test('registrar un paciente con un CUI/DPI ya existente responde 409', async () => {
  const app = crearApp({
    tables: { pacientes: { data: null, error: { code: '23505', message: 'duplicate key' } } },
  });
  const res = await request(app)
    .post('/api/pacientes')
    .set(...AUTH)
    .send({ nombre: 'Ana López', documento: '1234567890101' });

  assert.equal(res.status, 409);
});

test('validarDatosPaciente valida la fecha de nacimiento', () => {
  assert.equal(validarDatosPaciente({ nombre: 'Ana', fecha_nacimiento: '1990-05-17' }), null);
  assert.equal(validarDatosPaciente({ nombre: 'Ana', fecha_nacimiento: null }), null);
  assert.equal(validarDatosPaciente({ nombre: 'Ana', fecha_nacimiento: '' }), null);

  const invalidas = ['17/05/1990', '1990-13-40', '1990-02-30', 'hoy', 19900517, '1850-01-01', '2999-01-01'];
  for (const fecha_nacimiento of invalidas) {
    assert.equal(
      validarDatosPaciente({ nombre: 'Ana', fecha_nacimiento }),
      'Fecha de nacimiento inválida.',
      String(fecha_nacimiento)
    );
  }
});
