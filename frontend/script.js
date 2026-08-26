const SUPABASE_URL = 'https://bpisojfqhsaisfvnwhpr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_I0o7hKokgpc5hyIcBZeRQg_nLHEm60L';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const API_URL = 'http://localhost:3000';

let sintomasSeleccionados = [];
let listaSintomas = [];
let ultimoResultado = null;

// ===== NAVEGACIÓN ENTRE PANTALLAS =====
function mostrarPantalla(id) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  document.getElementById(id).classList.add('activa');
}

// ===== LOGIN =====
document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();

  const correo = document.getElementById('correo').value;
  const contrasena = document.getElementById('contrasena').value;
  const mensajeError = document.getElementById('mensaje-error');
  mensajeError.textContent = '';

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: correo,
    password: contrasena
  });

  if (error) {
    mensajeError.textContent = 'Correo o contraseña incorrectos.';
    console.error('Error de login:', error.message);
    return;
  }

  console.log('Usuario autenticado:', data.user.email);
  mostrarPantalla('pantalla-sintomas');
  cargarSintomas();
});

// ===== CARGAR SÍNTOMAS DESDE LA API =====
async function cargarSintomas() {
  try {
    const response = await fetch(`${API_URL}/api/sintomas`);
    listaSintomas = await response.json();

    const categorias = {
      respiratorio: document.getElementById('cat-respiratorio'),
      gastrointestinal: document.getElementById('cat-gastrointestinal'),
      general: document.getElementById('cat-general')
    };

    // Limpiar contenedores
    Object.values(categorias).forEach(c => c.innerHTML = '');

    listaSintomas.forEach(sintoma => {
      const btn = document.createElement('button');
      btn.className = 'btn-sintoma';
      btn.textContent = sintoma.nombre;
      btn.dataset.nombre = sintoma.nombre;
      btn.addEventListener('click', () => toggleSintoma(btn, sintoma.nombre));

      if (categorias[sintoma.categoria]) {
        categorias[sintoma.categoria].appendChild(btn);
      }
    });
  } catch (error) {
    console.error('Error cargando síntomas:', error);
    alert('No se pudo conectar con el servidor. Verifica que la API esté corriendo.');
  }
}

// ===== SELECCIONAR/DESELECCIONAR SÍNTOMA =====
function toggleSintoma(btn, nombre) {
  if (sintomasSeleccionados.includes(nombre)) {
    sintomasSeleccionados = sintomasSeleccionados.filter(s => s !== nombre);
    btn.classList.remove('seleccionado');
  } else {
    sintomasSeleccionados.push(nombre);
    btn.classList.add('seleccionado');
  }
  document.getElementById('contador-sintomas').textContent = `${sintomasSeleccionados.length} síntomas`;
}

// ===== ANALIZAR SÍNTOMAS =====
document.getElementById('btn-analizar').addEventListener('click', async () => {
  if (sintomasSeleccionados.length === 0) {
    alert('Debe seleccionar al menos un síntoma antes de continuar.');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/diagnosticar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sintomas: sintomasSeleccionados })
    });

    const resultado = await response.json();
    ultimoResultado = resultado;
    mostrarResultado(resultado);
    mostrarPantalla('pantalla-resultado');
  } catch (error) {
    console.error('Error al diagnosticar:', error);
    alert('Error al procesar el diagnóstico. Intente nuevamente.');
  }
});

// ===== MOSTRAR RESULTADO EN PANTALLA =====
function mostrarResultado(resultado) {
  const banner = document.getElementById('banner-advertencia');
  banner.style.display = resultado.confianza_suficiente ? 'none' : 'block';

  const diagnosticos = resultado.diagnosticos;
  const principal = diagnosticos[0];

  const principalDiv = document.getElementById('resultado-principal');
  principalDiv.innerHTML = `
    <div class="nombre-enfermedad">${principal.enfermedad}</div>
    <div class="barra-confianza">
      <div class="barra-confianza-fill" style="width:${principal.confianza}%">
        ${principal.confianza}%
      </div>
    </div>
  `;

  const alternativosDiv = document.getElementById('resultados-alternativos');
  alternativosDiv.innerHTML = '';
  diagnosticos.slice(1).forEach(d => {
    const div = document.createElement('div');
    div.className = 'alt-card';
    div.innerHTML = `<span>${d.enfermedad}</span><span>${d.confianza}%</span>`;
    alternativosDiv.appendChild(div);
  });
}

// ===== CONFIRMAR / DESCARTAR =====
document.getElementById('btn-confirmar').addEventListener('click', async () => {
  if (!ultimoResultado || !ultimoResultado.consulta_id) {
    alert('No se encontró la consulta a confirmar.');
    return;
  }

  try {
    await fetch(`${API_URL}/api/consultas/${ultimoResultado.consulta_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision_medico: 'confirmado' })
    });
    alert('Diagnóstico confirmado y registrado.');
    reiniciarConsulta();
  } catch (error) {
    console.error('Error al confirmar:', error);
    alert('Error al guardar la confirmación.');
  }
});

document.getElementById('btn-descartar').addEventListener('click', async () => {
  if (!ultimoResultado || !ultimoResultado.consulta_id) {
    alert('No se encontró la consulta a descartar.');
    return;
  }

  const diagnosticoDefinitivo = prompt('Ingrese el diagnóstico definitivo:');
  if (!diagnosticoDefinitivo) return;

  try {
    await fetch(`${API_URL}/api/consultas/${ultimoResultado.consulta_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision_medico: 'descartado',
        diagnostico_definitivo: diagnosticoDefinitivo
      })
    });
    alert('Sugerencia descartada. Diagnóstico registrado: ' + diagnosticoDefinitivo);
    reiniciarConsulta();
  } catch (error) {
    console.error('Error al descartar:', error);
    alert('Error al guardar el descarte.');
  }
});

document.getElementById('btn-nueva-consulta').addEventListener('click', reiniciarConsulta);

function reiniciarConsulta() {
  sintomasSeleccionados = [];
  document.querySelectorAll('.btn-sintoma').forEach(b => b.classList.remove('seleccionado'));
  document.getElementById('contador-sintomas').textContent = '0 síntomas';
  mostrarPantalla('pantalla-sintomas');
}

// ===== HISTORIAL DEL TURNO =====
document.getElementById('btn-ver-historial').addEventListener('click', async () => {
  await cargarHistorial();
  mostrarPantalla('pantalla-historial');
});

document.getElementById('btn-ir-consulta').addEventListener('click', reiniciarConsulta);

async function cargarHistorial() {
  const lista = document.getElementById('lista-historial');
  lista.innerHTML = '<p class="estado-vacio">Cargando...</p>';

  try {
    const response = await fetch(`${API_URL}/api/consultas`);
    const consultas = await response.json();

    if (consultas.length === 0) {
      lista.innerHTML = '<p class="estado-vacio">No hay consultas registradas en este turno.</p>';
      return;
    }

    lista.innerHTML = '';
    consultas.forEach(c => {
  const fecha = new Date(c.fecha + 'Z');
  const hora = fecha.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guatemala' });
  const diagnosticoPrincipal = c.resultado?.diagnosticos?.[0];

  const estadoBadge = c.decision_medico === 'confirmado'
    ? '<span style="color:#2E7D32; font-weight:600;">✓ Confirmado</span>'
    : c.decision_medico === 'descartado'
    ? '<span style="color:#C62828; font-weight:600;">✗ Descartado</span>'
    : '<span style="color:#999;">Pendiente</span>';

  const div = document.createElement('div');
  div.className = 'historial-card';
  div.innerHTML = `
    <div class="historial-hora">${hora} — ${estadoBadge}</div>
    <div class="historial-diagnostico">
      ${diagnosticoPrincipal ? diagnosticoPrincipal.enfermedad + ' — ' + diagnosticoPrincipal.confianza + '%' : 'Sin diagnóstico'}
    </div>
    <div class="historial-sintomas">Síntomas: ${c.sintomas_ingresados.join(', ')}</div>
  `;
  lista.appendChild(div);
});

  } catch (error) {
    console.error('Error cargando historial:', error);
    lista.innerHTML = '<p class="estado-vacio">Error al cargar el historial.</p>';
  }
}

// ===== RECUPERAR CONTRASEÑA =====
document.getElementById('link-recuperar').addEventListener('click', async () => {
  const correo = prompt('Ingresa tu correo electrónico para recuperar tu contraseña:');

  if (!correo) return;

  const { error } = await supabaseClient.auth.resetPasswordForEmail(correo);

  if (error) {
    alert('Error al enviar el correo de recuperación: ' + error.message);
  } else {
    alert('Se ha enviado un enlace de recuperación a tu correo electrónico.');
  }
});