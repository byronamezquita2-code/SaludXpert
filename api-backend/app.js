const axios = require('axios');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const Sentry = require('@sentry/node');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

// Sin SENTRY_DSN el SDK queda inicializado pero no envía nada — así que
// esto es seguro de dejar siempre activo, incluso en local/tests.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: 0,
});

const USUARIO_COLUMNAS_PUBLICAS = 'id, nombre, correo, rol, activo, creado_en';
const PACIENTE_COLUMNAS = 'id, nombre, documento, fecha_nacimiento, alergias, condiciones_cronicas, medicamentos_actuales, creado_en';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarDatosPaciente({ nombre, documento, alergias, condiciones_cronicas, medicamentos_actuales }) {
  if (typeof nombre !== 'string' || nombre.trim().length === 0 || nombre.length > 200) {
    return 'Nombre inválido — debe tener entre 1 y 200 caracteres.';
  }
  if (documento !== undefined && documento !== null && (typeof documento !== 'string' || documento.length > 50)) {
    return 'Documento inválido — máximo 50 caracteres.';
  }
  for (const [campo, valor] of [['alergias', alergias], ['condiciones_cronicas', condiciones_cronicas], ['medicamentos_actuales', medicamentos_actuales]]) {
    if (valor !== undefined && valor !== null && (typeof valor !== 'string' || valor.length > 1000)) {
      return `${campo} inválido — máximo 1000 caracteres.`;
    }
  }
  return null;
}

// El cliente de Supabase se puede inyectar (para tests con dobles de
// prueba); en producción createApp() se llama sin argumentos y usa los
// clientes reales construidos desde las variables de entorno.
function createApp({ supabase, supabaseAdmin } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const clienteSupabase = supabase || createClient(supabaseUrl, supabaseKey);
  const clienteSupabaseAdmin = supabaseAdmin || createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY);

  const app = express();
  // Render (y la mayoría de PaaS) ponen la app detrás de un proxy — sin
  // esto, express-rate-limit y req.ip verían siempre la IP interna del
  // proxy en vez de la del cliente real.
  app.set('trust proxy', 1);

  const allowedOrigins = (process.env.ALLOWED_ORIGIN || 'http://127.0.0.1:5500')
    .split(',')
    .map(o => o.trim());

  app.use(cors({
    origin: (origin, callback) => {
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

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes — intenta de nuevo en unos minutos.' },
  });
  app.use('/api', limiter);

  async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'No autenticado — falta el token.' });
    }

    const { data, error } = await clienteSupabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Token inválido o expirado.' });
    }

    req.authUser = data.user;
    next();
  }

  async function requireAdmin(req, res, next) {
    try {
      const { data, error } = await clienteSupabaseAdmin
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
      Sentry.captureException(err);
      res.status(500).json({ error: 'Error verificando permisos.' });
    }
  }

  async function requireMedicoOAdmin(req, res, next) {
    try {
      const { data, error } = await clienteSupabaseAdmin
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
      Sentry.captureException(err);
      res.status(500).json({ error: 'Error verificando permisos.' });
    }
  }

  app.get('/', (req, res) => {
    res.json({ mensaje: 'API SaludXpert funcionando correctamente' });
  });

  app.get('/api/sintomas', requireAuth, async (req, res) => {
    try {
      const { data, error } = await clienteSupabase.from('sintomas').select('*');
      if (error) throw error;
      res.json(data);
    } catch (error) {
      console.error('Error /api/sintomas:', error.message);
      Sentry.captureException(error);
      res.status(500).json({ error: 'Error al obtener síntomas.' });
    }
  });

  app.get('/api/enfermedades', requireAuth, async (req, res) => {
    try {
      const { data, error } = await clienteSupabase.from('enfermedades').select('*');
      if (error) throw error;
      res.json(data);
    } catch (error) {
      console.error('Error /api/enfermedades:', error.message);
      Sentry.captureException(error);
      res.status(500).json({ error: 'Error al obtener enfermedades.' });
    }
  });

  app.post('/api/diagnosticar', requireAuth, async (req, res) => {
    try {
      const { sintomas, paciente_id } = req.body;

      if (!sintomas || sintomas.length === 0) {
        return res.status(400).json({ error: 'Debe proporcionar al menos un síntoma.' });
      }
      if (!paciente_id || typeof paciente_id !== 'string') {
        return res.status(400).json({ error: 'Debe indicar el paciente de esta consulta.' });
      }

      const { data: paciente, error: pacienteError } = await clienteSupabaseAdmin
        .from('pacientes')
        .select('id')
        .eq('id', paciente_id)
        .single();

      if (pacienteError || !paciente) {
        return res.status(400).json({ error: 'Paciente no encontrado.' });
      }

      const { data: usuarioActual } = await clienteSupabaseAdmin
        .from('usuarios')
        .select('id')
        .eq('auth_id', req.authUser.id)
        .single();

      const MOTOR_URL = process.env.MOTOR_URL || 'http://localhost:5000';
      const response = await axios.post(
        `${MOTOR_URL}/api/diagnosticar`,
        { sintomas },
        { headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' } }
      );

      const resultado = response.data;

      const { data, error } = await clienteSupabaseAdmin.from('consultas').insert([
        {
          usuario_id: usuarioActual?.id || null,
          paciente_id: paciente.id,
          sintomas_ingresados: sintomas,
          resultado: resultado,
        }
      ]).select();

      if (error) {
        console.error('Error guardando consulta:', error.message);
        Sentry.captureException(error);
      }

      res.json({
        ...resultado,
        consulta_id: data ? data[0].id : null,
      });

    } catch (error) {
      console.error('Error /api/diagnosticar:', error.message);
      Sentry.captureException(error);
      res.status(500).json({ error: 'Error al procesar el diagnóstico.' });
    }
  });

  // Historial de consultas. Por defecto retorna solo el turno de hoy;
  // ?todas=true trae el historial completo (respetando ?limite=).
  app.get('/api/consultas', requireAuth, async (req, res) => {
    try {
      const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 100, 1), 500);
      const verTodas = req.query.todas === 'true';

      let query = clienteSupabaseAdmin
        .from('consultas')
        .select('*, pacientes(id, nombre)')
        .order('fecha', { ascending: false })
        .limit(limite);

      if (!verTodas) {
        const hoyGt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
        const inicioDiaUTC = `${hoyGt}T06:00:00.000Z`;
        query = query.gte('fecha', inicioDiaUTC);
      }

      const { data, error } = await query;
      if (error) throw error;
      res.json(data);
    } catch (error) {
      console.error('Error /api/consultas:', error.message);
      Sentry.captureException(error);
      res.status(500).json({ error: 'Error al obtener historial.' });
    }
  });

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

      const { data, error } = await clienteSupabaseAdmin
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
      Sentry.captureException(error);
      res.status(500).json({ error: 'Error al actualizar la consulta.' });
    }
  });

  app.get('/api/pacientes', requireAuth, async (req, res) => {
    try {
      const termino = String(req.query.buscar || '').replace(/[^\p{L}\p{N}\s]/gu, '').trim();

      if (!termino) {
        return res.json([]);
      }

      const { data, error } = await clienteSupabaseAdmin
        .from('pacientes')
        .select(PACIENTE_COLUMNAS)
        .or(`nombre.ilike.%${termino}%,documento.ilike.%${termino}%`)
        .order('nombre', { ascending: true })
        .limit(20);

      if (error) throw error;
      res.json(data);
    } catch (error) {
      console.error('Error GET /api/pacientes:', error.message);
      Sentry.captureException(error);
      res.status(500).json({ error: 'Error al buscar pacientes.' });
    }
  });

  app.post('/api/pacientes', requireAuth, async (req, res) => {
    try {
      const { nombre, documento, fecha_nacimiento, alergias, condiciones_cronicas, medicamentos_actuales } = req.body;

      const errorValidacion = validarDatosPaciente(req.body);
      if (errorValidacion) {
        return res.status(400).json({ error: errorValidacion });
      }

      const { data, error } = await clienteSupabaseAdmin
        .from('pacientes')
        .insert([{
          nombre: nombre.trim(),
          documento: documento || null,
          fecha_nacimiento: fecha_nacimiento || null,
          alergias: alergias || null,
          condiciones_cronicas: condiciones_cronicas || null,
          medicamentos_actuales: medicamentos_actuales || null,
        }])
        .select(PACIENTE_COLUMNAS);

      if (error) throw error;
      res.json(data[0]);
    } catch (error) {
      console.error('Error POST /api/pacientes:', error.message);
      Sentry.captureException(error);
      res.status(500).json({ error: 'Error al registrar paciente.' });
    }
  });

  app.patch('/api/pacientes/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { nombre, documento, fecha_nacimiento, alergias, condiciones_cronicas, medicamentos_actuales } = req.body;

      const errorValidacion = validarDatosPaciente(req.body);
      if (errorValidacion) {
        return res.status(400).json({ error: errorValidacion });
      }

      const { data, error } = await clienteSupabaseAdmin
        .from('pacientes')
        .update({
          nombre: nombre.trim(),
          documento: documento || null,
          fecha_nacimiento: fecha_nacimiento || null,
          alergias: alergias || null,
          condiciones_cronicas: condiciones_cronicas || null,
          medicamentos_actuales: medicamentos_actuales || null,
        })
        .eq('id', id)
        .select(PACIENTE_COLUMNAS);

      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado.' });
      }
      res.json(data[0]);
    } catch (error) {
      console.error('Error PATCH /api/pacientes:', error.message);
      Sentry.captureException(error);
      res.status(500).json({ error: 'Error al actualizar paciente.' });
    }
  });

  app.get('/api/pacientes/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const { data: paciente, error: pacienteError } = await clienteSupabaseAdmin
        .from('pacientes')
        .select(PACIENTE_COLUMNAS)
        .eq('id', id)
        .single();

      if (pacienteError || !paciente) {
        return res.status(404).json({ error: 'Paciente no encontrado.' });
      }

      const { data: consultas, error: consultasError } = await clienteSupabaseAdmin
        .from('consultas')
        .select('*')
        .eq('paciente_id', id)
        .order('fecha', { ascending: false })
        .limit(50);

      if (consultasError) throw consultasError;

      res.json({ ...paciente, consultas });
    } catch (error) {
      console.error('Error GET /api/pacientes/:id:', error.message);
      Sentry.captureException(error);
      res.status(500).json({ error: 'Error al obtener el paciente.' });
    }
  });

  app.get('/api/usuarios/me', requireAuth, async (req, res) => {
    try {
      const { data, error } = await clienteSupabaseAdmin
        .from('usuarios')
        .select('id, nombre, correo, rol, activo')
        .eq('auth_id', req.authUser.id)
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Usuario no encontrado.' });
      res.json(data);
    } catch (error) {
      console.error('Error /api/usuarios/me:', error.message);
      Sentry.captureException(error);
      res.status(500).json({ error: 'Error al obtener perfil.' });
    }
  });

  // Gestión de usuarios. GET visible para médicos y administradores (un
  // médico solo ve médicos); POST/PATCH solo administrador.
  app.get('/api/usuarios', requireAuth, requireMedicoOAdmin, async (req, res) => {
    try {
      let query = clienteSupabaseAdmin.from('usuarios').select(USUARIO_COLUMNAS_PUBLICAS).order('creado_en', { ascending: false });
      if (req.rolUsuario === 'medico') {
        query = query.eq('rol', 'medico');
      }
      const { data, error } = await query;

      if (error) throw error;
      res.json(data);
    } catch (error) {
      console.error('Error GET /api/usuarios:', error.message);
      Sentry.captureException(error);
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

      const { data: authData, error: authError } = await clienteSupabaseAdmin.auth.admin.inviteUserByEmail(
        correo,
        { data: { nombre, rol } }
      );

      if (authError) throw authError;

      const { data, error } = await clienteSupabaseAdmin
        .from('usuarios')
        .insert([{ nombre, correo, rol, activo: true, auth_id: authData.user.id }])
        .select(USUARIO_COLUMNAS_PUBLICAS);

      if (error) throw error;
      res.json(data[0]);
    } catch (error) {
      console.error('Error POST /api/usuarios:', error.message);
      Sentry.captureException(error);
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

      const { data, error } = await clienteSupabaseAdmin
        .from('usuarios')
        .update({ activo })
        .eq('id', id)
        .select(USUARIO_COLUMNAS_PUBLICAS);

      if (error) throw error;
      res.json(data[0]);
    } catch (error) {
      console.error('Error PATCH /api/usuarios:', error.message);
      Sentry.captureException(error);
      res.status(500).json({ error: 'Error al actualizar usuario.' });
    }
  });

  Sentry.setupExpressErrorHandler(app);

  // Error handler final — cubre lo que Sentry re-lanza (p.ej. errores
  // síncronos no atrapados por un try/catch de arriba) y responde JSON
  // en vez del HTML por defecto de Express.
  app.use((err, req, res, next) => {
    console.error('Error no manejado:', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  return { app };
}

module.exports = { createApp, validarDatosPaciente };
