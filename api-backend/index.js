const axios = require('axios');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ── CORS ──────────────────────────────────────────────────────────────────────
// Solo el dominio del frontend puede llamar a esta API.
// Configura ALLOWED_ORIGIN en el .env (puede ser una lista separada por comas).
const allowedOrigins = (process.env.ALLOWED_ORIGIN || 'http://127.0.0.1:5500')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origin (Postman, curl, misma red interna)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin no permitido — ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// ── Supabase ──────────────────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY);

// Columnas de "usuarios" seguras para devolver al frontend — deja fuera
// auth_id (identificador interno de Supabase Auth, sin uso en la UI y sin
// motivo para viajar en cada respuesta).
const USUARIO_COLUMNAS_PUBLICAS = 'id, nombre, correo, rol, activo, creado_en';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Middleware: autenticación ─────────────────────────────────────────────────
// Verifica que el JWT de Supabase es válido antes de servir cualquier ruta
// protegida. Adjunta el usuario en req.authUser.
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No autenticado — falta el token.' });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }

  req.authUser = data.user;
  next();
}

// ── Middleware: solo administradores ─────────────────────────────────────────
// Debe usarse DESPUÉS de requireAuth.
async function requireAdmin(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .select('rol')
      .eq('auth_id', req.authUser.id)
      .single();

    if (error || !data) {
      return res.status(403).json({ error: 'Usuario no encontrado en el sistema.' });
    }
    if (data.rol !== 'administrador') {
      return res.status(403).json({ error: 'Acceso denegado — se requiere rol administrador.' });
    }
    req.rolUsuario = data.rol;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Error verificando permisos.' });
  }
}

// ── Middleware: médicos o administradores ────────────────────────────────────
// Para vistas de solo lectura que los médicos también deben poder ver
// (equipo médico, diagnósticos del día), pero enfermería no.
// Debe usarse DESPUÉS de requireAuth.
async function requireMedicoOAdmin(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .select('id, rol')
      .eq('auth_id', req.authUser.id)
      .single();

    if (error || !data) {
      return res.status(403).json({ error: 'Usuario no encontrado en el sistema.' });
    }
    if (!['medico', 'administrador'].includes(data.rol)) {
      return res.status(403).json({ error: 'Acceso denegado.' });
    }
    req.rolUsuario = data.rol;
    req.usuarioId = data.id;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Error verificando permisos.' });
  }
}

// ── Ruta de salud ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ mensaje: 'API SaludXpert funcionando correctamente' });
});

// ── Síntomas ──────────────────────────────────────────────────────────────────
app.get('/api/sintomas', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('sintomas').select('*');
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error /api/sintomas:', error.message);
    res.status(500).json({ error: 'Error al obtener síntomas.' });
  }
});

// ── Enfermedades ──────────────────────────────────────────────────────────────
app.get('/api/enfermedades', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('enfermedades').select('*');
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error /api/enfermedades:', error.message);
    res.status(500).json({ error: 'Error al obtener enfermedades.' });
  }
});

// ── Diagnóstico ───────────────────────────────────────────────────────────────
app.post('/api/diagnosticar', requireAuth, async (req, res) => {
  try {
    const { sintomas } = req.body;

    if (!sintomas || sintomas.length === 0) {
      return res.status(400).json({ error: 'Debe proporcionar al menos un síntoma.' });
    }

    // Resolver el id interno del usuario autenticado — nunca confiar en un
    // usuario_id que mande el cliente en el body.
    const { data: usuarioActual } = await supabaseAdmin
      .from('usuarios')
      .select('id')
      .eq('auth_id', req.authUser.id)
      .single();

    // Llamar al motor de inferencia en Flask con el secret interno
    const MOTOR_URL = process.env.MOTOR_URL || 'http://localhost:5000';
    const response = await axios.post(
      `${MOTOR_URL}/api/diagnosticar`,
      { sintomas },
      { headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' } }
    );

    const resultado = response.data;

    // Guardar la consulta en la base de datos
    const { data, error } = await supabaseAdmin.from('consultas').insert([
      {
        usuario_id: usuarioActual?.id || null,
        sintomas_ingresados: sintomas,
        resultado: resultado,
      }
    ]).select();

    if (error) {
      console.error('Error guardando consulta:', error.message);
    }

    res.json({
      ...resultado,
      consulta_id: data ? data[0].id : null,
    });

  } catch (error) {
    console.error('Error /api/diagnosticar:', error.message);
    res.status(500).json({ error: 'Error al procesar el diagnóstico.' });
  }
});

// ── Historial de consultas ────────────────────────────────────────────────────
// Por defecto retorna solo las consultas del turno de hoy (hora Guatemala,
// UTC-6 todo el año, sin horario de verano) con un límite razonable, para
// que la pantalla "Historial del Turno" no cargue el historial completo del
// sistema. Con ?todas=true se puede pedir el historial completo (sigue
// respetando el límite via ?limite=). Ej: /api/consultas?todas=true&limite=200
app.get('/api/consultas', requireAuth, async (req, res) => {
  try {
    const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 100, 1), 500);
    const verTodas = req.query.todas === 'true';

    let query = supabaseAdmin
      .from('consultas')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(limite);

    if (!verTodas) {
      // "Hoy" en hora de Guatemala (UTC-6 fijo), convertido a UTC para
      // comparar contra la columna `fecha` (timestamptz en UTC).
      const hoyGt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' }); // YYYY-MM-DD
      const inicioDiaUTC = `${hoyGt}T06:00:00.000Z`; // 00:00 GT = 06:00 UTC
      query = query.gte('fecha', inicioDiaUTC);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error /api/consultas:', error.message);
    res.status(500).json({ error: 'Error al obtener historial.' });
  }
});

// ── Actualizar decisión médica ────────────────────────────────────────────────
// Solo médicos y administradores pueden confirmar/descartar un diagnóstico —
// enfermería puede ver el historial (GET /api/consultas) pero no decidir
// sobre él. Se registra quién tomó la decisión en actualizado_por.
app.patch('/api/consultas/:id', requireAuth, requireMedicoOAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { decision_medico, diagnostico_definitivo } = req.body;

    if (!['confirmado', 'descartado'].includes(decision_medico)) {
      return res.status(400).json({ error: 'decision_medico inválido — debe ser "confirmado" o "descartado".' });
    }
    if (diagnostico_definitivo !== undefined && diagnostico_definitivo !== null) {
      if (typeof diagnostico_definitivo !== 'string' || diagnostico_definitivo.length > 2000) {
        return res.status(400).json({ error: 'diagnostico_definitivo inválido — máximo 2000 caracteres.' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('consultas')
      .update({
        decision_medico,
        diagnostico_definitivo: diagnostico_definitivo || null,
        actualizado_por: req.usuarioId,
      })
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Consulta no encontrada.' });
    }
    res.json(data[0]);
  } catch (error) {
    console.error('Error PATCH /api/consultas:', error.message);
    res.status(500).json({ error: 'Error al actualizar la consulta.' });
  }
});

// ── Perfil del usuario actual ─────────────────────────────────────────────────
// Evita que el frontend descargue TODOS los usuarios solo para mostrar el nombre.
app.get('/api/usuarios/me', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .select('id, nombre, correo, rol, activo')
      .eq('auth_id', req.authUser.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json(data);
  } catch (error) {
    console.error('Error /api/usuarios/me:', error.message);
    res.status(500).json({ error: 'Error al obtener perfil.' });
  }
});

// ── Gestión de usuarios ────────────────────────────────────────────────────────
// GET: visible para médicos y administradores. Un médico solo ve la lista
// de médicos usando el sistema (sin correos de enfermería/administración);
// el administrador ve a todos.
// POST/PATCH (agregar, activar/desactivar): solo administrador.
app.get('/api/usuarios', requireAuth, requireMedicoOAdmin, async (req, res) => {
  try {
    let query = supabaseAdmin.from('usuarios').select(USUARIO_COLUMNAS_PUBLICAS).order('creado_en', { ascending: false });
    if (req.rolUsuario === 'medico') {
      query = query.eq('rol', 'medico');
    }
    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error GET /api/usuarios:', error.message);
    res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
});

app.post('/api/usuarios', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { nombre, correo, rol } = req.body;

    if (!['medico', 'enfermeria', 'administrador'].includes(rol)) {
      return res.status(400).json({ error: 'Rol inválido.' });
    }
    if (typeof nombre !== 'string' || nombre.trim().length === 0 || nombre.length > 200) {
      return res.status(400).json({ error: 'Nombre inválido — debe tener entre 1 y 200 caracteres.' });
    }
    if (typeof correo !== 'string' || correo.length > 254 || !EMAIL_REGEX.test(correo)) {
      return res.status(400).json({ error: 'Correo inválido.' });
    }

    // Invitar al usuario mediante Supabase Auth (le llega correo automático)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      correo,
      { data: { nombre, rol } }
    );

    if (authError) throw authError;

    // Guardar el registro en la tabla usuarios con su auth_id
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .insert([{ nombre, correo, rol, activo: true, auth_id: authData.user.id }])
      .select(USUARIO_COLUMNAS_PUBLICAS);

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    console.error('Error POST /api/usuarios:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;

    if (typeof activo !== 'boolean') {
      return res.status(400).json({ error: 'activo debe ser true o false.' });
    }

    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .update({ activo })
      .eq('id', id)
      .select(USUARIO_COLUMNAS_PUBLICAS);

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    console.error('Error PATCH /api/usuarios:', error.message);
    res.status(500).json({ error: 'Error al actualizar usuario.' });
  }
});

// ── Iniciar servidor ──────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor SaludXpert corriendo en puerto ${PORT}`);
});