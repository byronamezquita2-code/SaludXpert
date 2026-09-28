// Doble de prueba del cliente de Supabase: cada tabla responde lo que se le precarga.

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

function builderFor(queues, table, inserts) {
  const result = nextResult(queues, table);
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    gte: () => builder,
    or: () => builder,
    insert: (filas) => { inserts.push({ table, filas }); return builder; },
    update: () => builder,
    delete: () => builder,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function createSupabaseStub({ user = null, tables = {}, inviteUser, deleteUser, resetPassword } = {}) {
  const queues = { ...tables };
  const inserts = [];

  return {
    inserts,
    from: (table) => builderFor(queues, table, inserts),
    auth: {
      getUser: async () =>
        user ? { data: { user }, error: null } : { data: null, error: { message: 'invalid token' } },
      resetPasswordForEmail: resetPassword || (async () => ({ data: {}, error: null })),
      admin: {
        inviteUserByEmail:
          inviteUser || (async () => ({ data: { user: { id: 'auth-nuevo' } }, error: null })),
        deleteUser: deleteUser || (async () => ({ data: null, error: null })),
      },
    },
  };
}

module.exports = { createSupabaseStub };
