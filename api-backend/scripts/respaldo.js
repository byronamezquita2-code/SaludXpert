require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const { cifrar, pedirClave, LARGO_MINIMO_CLAVE } = require('./cifrado');

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
  const cifrado = process.argv.includes('--cifrar');
  let clave = null;
  if (cifrado) {
    clave = await pedirClave(`Contraseña del respaldo (mínimo ${LARGO_MINIMO_CLAVE} caracteres): `);
    if (clave.length < LARGO_MINIMO_CLAVE) throw new Error(`La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
    if (!process.env.RESPALDO_CLAVE && (await pedirClave('Repítela: ')) !== clave) throw new Error('Las contraseñas no coinciden.');
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const marca = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(__dirname, '..', '..', 'respaldos');
  fs.mkdirSync(base, { recursive: true, mode: 0o700 });

  const datos = {};
  for (const tabla of TABLAS) {
    datos[tabla] = await exportarTabla(supabase, tabla);
    console.log(`${tabla}: ${datos[tabla].length} filas`);
  }

  if (cifrado) {
    const destino = path.join(base, `${marca}.sxbk`);
    fs.writeFileSync(destino, cifrar(Buffer.from(JSON.stringify(datos)), clave), { mode: 0o600 });
    console.log(`Respaldo cifrado guardado en ${destino}`);
    return;
  }

  const carpeta = path.join(base, marca);
  fs.mkdirSync(carpeta, { mode: 0o700 });
  for (const tabla of TABLAS) {
    fs.writeFileSync(path.join(carpeta, `${tabla}.json`), JSON.stringify(datos[tabla], null, 2), { mode: 0o600 });
  }
  console.log(`Respaldo guardado en ${carpeta}`);
}

main().catch(err => {
  console.error('Falló el respaldo:', err.message);
  process.exit(1);
});
