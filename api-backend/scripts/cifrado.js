const crypto = require('node:crypto');
const readline = require('node:readline');

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
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let silenciar = false;
    rl._writeToOutput = texto => { if (!silenciar) process.stdout.write(texto); };
    process.stdout.write(pregunta);
    silenciar = true;
    rl.question('', respuesta => {
      rl.close();
      process.stdout.write('\n');
      resolve(respuesta);
    });
  });
}

module.exports = { cifrar, descifrar, pedirClave, LARGO_MINIMO_CLAVE };
