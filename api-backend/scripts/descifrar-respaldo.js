const fs = require('node:fs');
const path = require('node:path');
const { descifrar, pedirClave } = require('./cifrado');

async function main() {
  const archivo = process.argv[2];
  if (!archivo) throw new Error('Uso: npm run descifrar -- ruta/al/respaldo.sxbk');

  const clave = await pedirClave('Contraseña del respaldo: ');
  const datos = JSON.parse(descifrar(fs.readFileSync(archivo), clave).toString());

  const carpeta = archivo.replace(/\.sxbk$/, '') + '-descifrado';
  fs.mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  for (const [tabla, filas] of Object.entries(datos)) {
    fs.writeFileSync(path.join(carpeta, `${tabla}.json`), JSON.stringify(filas, null, 2), { mode: 0o600 });
    console.log(`${tabla}: ${filas.length} filas`);
  }
  console.log(`Descifrado en ${carpeta}`);
}

main().catch(err => {
  console.error('Falló:', err.message);
  process.exit(1);
});
