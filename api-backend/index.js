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
    const { data, error } = await supabase
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
    const { sintomas, usuario_id } = req.body;

    if (!sintomas || sintomas.length === 0) {
      return res.status(400).json({ error: 'Debe proporcionar al menos un síntoma.' });
    }

    // Llamar al motor de inferencia en Flask con el secret interno
    const MOTOR_URL = process.env.MOTOR_URL || 'http://localhost:5000';
    const response = await axios.post(
      `${MOTOR_URL}/api/diagnosticar`,
      { sintomas },
      { headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' } }
    );

    const resultado = response.data;

    // Guardar la consulta en la base de datos
    const { data, error } = await supabase.from('consultas').insert([
      {
        usuario_id: usuario_id || null,
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
app.get('/api/consultas', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('consultas')
      .select('*')
      .order('fecha', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error /api/consultas:', error.message);
    res.status(500).json({ error: 'Error al obtener historial.' });
  }
});

// ── Actualizar decisión médica ────────────────────────────────────────────────
app.patch('/api/consultas/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { decision_medico, diagnostico_definitivo } = req.body;

    const { data, error } = await supabase
      .from('consultas')
      .update({
        decision_medico,
        diagnostico_definitivo: diagnostico_definitivo || null,
      })
      .eq('id', id)
      .select();

    if (error) throw error;
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
    const { data, error } = await supabase
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

// ── Gestión de usuarios (solo administrador) ──────────────────────────────────
app.get('/api/usuarios', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .order('creado_en', { ascending: false });

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

    // Invitar al usuario mediante Supabase Auth (le llega correo automático)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      correo,
      { data: { nombre, rol } }
    );

    if (authError) throw authError;

    // Guardar el registro en la tabla usuarios con su auth_id
    const { data, error } = await supabase
      .from('usuarios')
      .insert([{ nombre, correo, rol, activo: true, auth_id: authData.user.id }])
      .select();

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

    const { data, error } = await supabase
      .from('usuarios')
      .update({ activo })
      .eq('id', id)
      .select();

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