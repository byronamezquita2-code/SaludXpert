require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const TABLAS = ['usuarios', 'pacientes', 'consultas', 'sintomas', 'enfermedades', 'enfermedad_sintoma'];
const PAGINA = 1000;

async function exportarTabla(supabase, tabla) {
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from(tabla)
      .select('*')
      .order('id')
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...data);
    if (data.length < PAGINA) break;
  }
  return filas;
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const marca = new Date().toISOString().replace(/[:.]/g, '-');
  const carpeta = path.join(__dirname, '..', '..', 'respaldos', marca);
  fs.mkdirSync(carpeta, { recursive: true, mode: 0o700 });

  for (const tabla of TABLAS) {
    const filas = await exportarTabla(supabase, tabla);
    fs.writeFileSync(path.join(carpeta, `${tabla}.json`), JSON.stringify(filas, null, 2), { mode: 0o600 });
    console.log(`${tabla}: ${filas.length} filas`);
  }
  console.log(`Respaldo guardado en ${carpeta}`);
}

main().catch(err => {
  console.error('Falló el respaldo:', err.message);
  process.exit(1);
});
