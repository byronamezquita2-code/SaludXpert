const test = require('node:test');
const assert = require('node:assert/strict');
const { cifrar, descifrar } = require('../scripts/cifrado');

const datos = Buffer.from(JSON.stringify({ pacientes: [{ id: 1, nombre: 'Ana López' }] }));

test('un respaldo cifrado se descifra con la contraseña correcta', () => {
  const archivo = cifrar(datos, 'una-contraseña-larga');
  assert.equal(descifrar(archivo, 'una-contraseña-larga').toString(), datos.toString());
});

test('el archivo cifrado no contiene los datos en texto plano', () => {
  const archivo = cifrar(datos, 'una-contraseña-larga');
  assert.equal(archivo.includes('Ana'), false);
});

test('una contraseña incorrecta o un archivo alterado no se descifran', () => {
  const archivo = cifrar(datos, 'una-contraseña-larga');
  assert.throws(() => descifrar(archivo, 'otra-contraseña-larga'), /Contraseña incorrecta/);

  const alterado = Buffer.from(archivo);
  alterado[alterado.length - 1] ^= 1;
  assert.throws(() => descifrar(alterado, 'una-contraseña-larga'), /Contraseña incorrecta/);
});

test('rechaza archivos que no son respaldos de SaludXpert', () => {
  assert.throws(() => descifrar(Buffer.from('cualquier cosa'), 'x'), /no es un respaldo/);
});
