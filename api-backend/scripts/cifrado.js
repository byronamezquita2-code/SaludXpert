const crypto = require('node:crypto');

const MAGIA = Buffer.from('SXBK1');
const LARGO_MINIMO_CLAVE = 12;

function derivarLlave(clave, sal) {
  return crypto.scryptSync(clave, sal, 32);
}

function cifrar(contenido, clave) {
  const sal = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv('aes-256-gcm', derivarLlave(clave, sal), iv);
  const cifrado = Buffer.concat([cifrador.update(contenido), cifrador.final()]);
  return Buffer.concat([MAGIA, sal, iv, cifrador.getAuthTag(), cifrado]);
}

function descifrar(archivo, clave) {
  if (!archivo.subarray(0, MAGIA.length).equals(MAGIA)) {
    throw new Error('El archivo no es un respaldo de SaludXpert.');
  }
  const sal = archivo.subarray(5, 21);
  const iv = archivo.subarray(21, 33);
  const etiqueta = archivo.subarray(33, 49);
  const cifrado = archivo.subarray(49);
  const descifrador = crypto.createDecipheriv('aes-256-gcm', derivarLlave(clave, sal), iv);
  descifrador.setAuthTag(etiqueta);
  try {
    return Buffer.concat([descifrador.update(cifrado), descifrador.final()]);
  } catch {
    throw new Error('Contraseña incorrecta o archivo dañado.');
  }
}

function pedirClave(pregunta) {
  if (process.env.RESPALDO_CLAVE) return Promise.resolve(process.env.RESPALDO_CLAVE);
  return new Promise((resolve, reject) => {
    const entrada = process.stdin;
    let texto = '';
    process.stdout.write(pregunta);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');

    const terminar = () => {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.removeListener('data', alRecibir);
      process.stdout.write('\n');
    };
    const alRecibir = tecla => {
      for (const c of tecla) {
        if (c === '\r' || c === '\n') { terminar(); return resolve(texto); }
        if (c === '\u0003') { terminar(); return reject(new Error('Cancelado.')); }
        if (c === '\u007f' || c === '\b') { texto = texto.slice(0, -1); continue; }
        texto += c;
      }
    };
    entrada.on('data', alRecibir);
  });
}

module.exports = { cifrar, descifrar, pedirClave, LARGO_MINIMO_CLAVE };
