// Doble de prueba mínimo para el cliente de @supabase/supabase-js. No
// reimplementa PostgREST — solo permite precargar qué debe responder cada
// llamada a `.from(tabla)`, en orden, para poder probar la lógica de
// autorización y las rutas de app.js sin pegarle a un Supabase real.
//
// Uso:
//   const supabaseAdmin = createSupabaseStub({
//     user: { id: 'auth-1' },
//     tables: {
//       usuarios: { data: { rol: 'administrador' }, error: null },       // resultado fijo, se repite
//       pacientes: [                                                       // cola: una respuesta por llamada
//         { data: { id: 'p1', nombre: 'Ana' }, error: null },
//         { data: [{ id: 'p1', nombre: 'Ana' }], error: null },
//       ],
//     },
//   });

function nextResult(queues, table) {
  const q = queues[table];
  if (q === undefined) {
    return { data: null, error: { message: `[stub] tabla no configurada: ${table}` } };
  }
  if (Array.isArray(q)) {
    if (q.length === 0) {
      return { data: null, error: { message: `[stub] no quedan resultados configurados para: ${table}` } };
    }
    return q.length === 1 ? q[0] : q.shift();
  }
  return q;
}

function builderFor(queues, table) {
  const result = nextResult(queues, table);
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    gte: () => builder,
    or: () => builder,
    insert: () => builder,
    update: () => builder,
    single: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function createSupabaseStub({ user = null, tables = {}, inviteUser } = {}) {
  const queues = { ...tables };

  return {
    from: (table) => builderFor(queues, table),
    auth: {
      getUser: async () =>
        user ? { data: { user }, error: null } : { data: null, error: { message: 'invalid token' } },
      admin: {
        inviteUserByEmail:
          inviteUser || (async () => ({ data: { user: { id: 'auth-nuevo' } }, error: null })),
      },
    },
  };
}

module.exports = { createSupabaseStub };
