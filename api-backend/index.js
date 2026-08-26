const axios = require('axios');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ mensaje: 'API SaludXpert funcionando correctamente' });
});

// Ruta: obtener lista de síntomas agrupados por categoría
app.get('/api/sintomas', async (req, res) => {
  try {
    const { data, error } = await supabase.from('sintomas').select('*');
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta: obtener lista de enfermedades
app.get('/api/enfermedades', async (req, res) => {
  try {
    const { data, error } = await supabase.from('enfermedades').select('*');
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta: enviar síntomas al motor de inferencia  y obtener diagnóstico
app.post('/api/diagnosticar', async (req, res) => {
  try {
    const { sintomas, usuario_id } = req.body;

    if (!sintomas || sintomas.length === 0) {
      return res.status(400).json({ error: 'Debe proporcionar al menos un síntoma' });
    }

    // Llamar al motor de inferencia en Flask
    const response = await axios.post('http://localhost:5000/api/diagnosticar', {
      sintomas: sintomas
    });

    const resultado = response.data;

    // Guardar la consulta en la base de datos
    const { data, error } = await supabase.from('consultas').insert([
      {
        usuario_id: usuario_id || null,
        sintomas_ingresados: sintomas,
        resultado: resultado
      }
    ]).select();

    if (error) {
      console.error('Error guardando consulta:', error.message);
    }

    res.json({
      ...resultado,
      consulta_id: data ? data[0].id : null
    });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Error al procesar el diagnóstico' });
  }
});

// Ruta: obtener historial de consultas
app.get('/api/consultas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('consultas')
      .select('*')
      .order('fecha', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});