// ── Configuración ─────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://bpisojfqhsaisfvnwhpr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_I0o7hKokgpc5hyIcBZeRQg_nLHEm60L';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const API_URL = 'https://saludxpert-api.onrender.com';

let sintomasSeleccionados = [];
let listaSintomas = [];
let ultimoResultado = null;
let usuarioActual = null;

// ── Helper de fetch autenticado ───────────────────────────────────────────────
// Incluye el JWT de Supabase en cada petición a nuestra API.
async function apiFetch(path, options = {}) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const token = sessionData?.session?.access_token;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Error ${response.status}`);
  }

  return response.json();
}

// ── Modal personalizado (reemplaza alert / prompt) ────────────────────────────
const appDialog = document.getElementById('app-dialog');
const dialogTitle = document.getElementById('dialog-title');
const dialogBody = document.getElementById('dialog-body');
const dialogInput = document.getElementById('dialog-input');
const dialogConfirm = document.getElementById('dialog-confirm');
const dialogCancel = document.getElementById('dialog-cancel');

/**
 * Muestra un mensaje informativo (reemplaza alert).
 * @param {string} titulo
 * @param {string} mensaje
 */
function mostrarAlerta(titulo, mensaje) {
  return new Promise(resolve => {
    dialogTitle.textContent = titulo;
    dialogBody.textContent = mensaje;
    dialogInput.style.display = 'none';
    dialogCancel.style.display = 'none';
    dialogConfirm.textContent = 'Aceptar';

    const onConfirm = () => {
      appDialog.close();
      dialogConfirm.removeEventListener('click', onConfirm);
      resolve();
    };
    dialogConfirm.addEventListener('click', onConfirm);
    appDialog.showModal();
  });
}

/**
 * Muestra un input de texto (reemplaza prompt).
 * Resuelve con el valor ingresado o null si cancela.
 * @param {string} titulo
 * @param {string} placeholder
 */
function mostrarPrompt(titulo, placeholder = '') {
  return new Promise(resolve => {
    dialogTitle.textContent = titulo;
    dialogBody.textContent = '';
    dialogInput.style.display = 'block';
    dialogInput.value = '';
    dialogInput.placeholder = placeholder;
    dialogCancel.style.display = '';
    dialogConfirm.textContent = 'Aceptar';

    const onConfirm = () => {
      const valor = dialogInput.value.trim();
      appDialog.close();
      cleanup();
      resolve(valor || null);
    };
    const onCancel = () => {
      appDialog.close();
      cleanup();
      resolve(null);
    };
    function cleanup() {
      dialogConfirm.removeEventListener('click', onConfirm);
      dialogCancel.removeEventListener('click', onCancel);
    }

    dialogConfirm.addEventListener('click', onConfirm);
    dialogCancel.addEventListener('click', onCancel);
    appDialog.showModal();
    setTimeout(() => dialogInput.focus(), 50);
  });
}

// ── Navegación ────────────────────────────────────────────────────────────────
function mostrarPantalla(id) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  document.getElementById(id).classList.add('activa');

  // Actualizar estado activo del nav en la pantalla visible
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('nav-link-active'));
  const mapa = {
    'pantalla-sintomas': 'nav-nueva',
    'pantalla-resultado': 'nav-nueva',
    'pantalla-historial': 'nav-historial',
    'pantalla-admin': 'nav-admin',
  };
  const activo = mapa[id];
  if (activo) {
    document.querySelectorAll(`.${activo}`).forEach(l => l.classList.add('nav-link-active'));
  }
}

// ── Sidebar y Topbar (generados una sola vez) ─────────────────────────────────
function logoSVG() {
  return `<svg class="w-7 h-7 text-primary" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L3 6v6c0 5 4 9 9 10 5-1 9-5 9-10V6l-9-4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
}

/**
 * Construye el sidebar HTML para una pantalla.
 * isAdmin: si es true muestra el enlace de Administración.
 */
function sidebarHTML(isAdmin) {
  const adminLink = isAdmin
    ? `<span class="nav-link nav-admin" id="nav-admin-link">
         <span class="material-symbols-outlined mr-md">admin_panel_settings</span>
         <span class="font-label-md text-label-md">Administración</span>
       </span>`
    : '';

  return `
    <div class="h-16 flex items-center px-6 gap-sm border-b border-outline-variant">
      ${logoSVG()}
      <span class="font-headline-sm text-headline-sm text-primary">SaludXpert</span>
    </div>
    <nav class="flex-1 flex flex-col gap-xs px-md pt-lg">
      <span class="nav-link nav-nueva" id="nav-nueva-link">
        <span class="material-symbols-outlined mr-md">add_circle</span>
        <span class="font-label-md text-label-md">Nueva Consulta</span>
      </span>
      <span class="nav-link nav-historial" id="nav-historial-link">
        <span class="material-symbols-outlined mr-md">history</span>
        <span class="font-label-md text-label-md">Historial</span>
      </span>
      ${adminLink}
    </nav>
  `;
}

function topbarHTML() {
  return `
    <span class="text-label-md font-label-md text-on-surface-variant">Centro de Salud Salcajá</span>
    <div class="flex items-center gap-md">
      <div class="text-right">
        <p class="text-label-md font-label-md text-on-surface leading-none topbar-usuario-nombre"></p>
        <p class="text-xs text-on-secondary-container topbar-usuario-rol"></p>
      </div>
      <button class="btn-logout flex items-center text-on-surface-variant hover:text-error transition-colors" title="Cerrar sesión">
        <span class="material-symbols-outlined">logout</span>
      </button>
    </div>
  `;
}

function inyectarShell(isAdmin) {
  const pantallas = ['sintomas', 'resultado', 'historial', 'admin'];
  pantallas.forEach(p => {
    const sidebar = document.getElementById(`sidebar-${p}`);
    const topbar = document.getElementById(`topbar-${p}`);
    if (sidebar) sidebar.innerHTML = sidebarHTML(isAdmin);
    if (topbar) topbar.innerHTML = topbarHTML();
  });
  registrarEventosShell();
}

function registrarEventosShell() {
  // Nav: Nueva Consulta
  document.querySelectorAll('#nav-nueva-link').forEach(el =>
    el.addEventListener('click', reiniciarConsulta));

  // Nav: Historial
  document.querySelectorAll('#nav-historial-link').forEach(el =>
    el.addEventListener('click', async () => {
      await cargarHistorial();
      mostrarPantalla('pantalla-historial');
    }));

  // Nav: Admin
  document.querySelectorAll('#nav-admin-link').forEach(el =>
    el.addEventListener('click', async () => {
      await cargarPanelAdmin();
      mostrarPantalla('pantalla-admin');
    }));

  // Logout
  document.querySelectorAll('.btn-logout').forEach(btn =>
    btn.addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      usuarioActual = null;
      document.getElementById('correo').value = '';
      document.getElementById('contrasena').value = '';
      mostrarPantalla('pantalla-login');
    }));
}

// ── Topbar: nombre y rol del usuario ─────────────────────────────────────────
function capitalizar(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function actualizarTopbarUsuario() {
  document.querySelectorAll('.topbar-usuario-nombre').forEach(el => {
    el.textContent = usuarioActual ? usuarioActual.nombre : '';
  });
  document.querySelectorAll('.topbar-usuario-rol').forEach(el => {
    el.textContent = usuarioActual ? capitalizar(usuarioActual.rol) : '';
  });
}

// Usa el nuevo endpoint /me en lugar de descargar TODOS los usuarios
async function cargarUsuarioActual() {
  try {
    const data = await apiFetch('/api/usuarios/me');
    usuarioActual = { correo: data.correo, nombre: data.nombre, rol: data.rol };
  } catch {
    // Si falla (usuario nuevo sin registro en tabla) mantenemos los datos mínimos del JWT
  }
  actualizarTopbarUsuario();
}

// ── Sesión persistente (no regresar a login al refrescar) ─────────────────────
async function restaurarSesion() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (sessionData?.session) {
    await cargarUsuarioActual();
    const esAdmin = usuarioActual?.rol === 'administrador';
    inyectarShell(esAdmin);
    mostrarPantalla('pantalla-sintomas');
    cargarSintomas();
  }
}

// Ejecutar al cargar la página
restaurarSesion();

// ── LOGIN ─────────────────────────────────────────────────────────────────────
document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();

  const correo = document.getElementById('correo').value;
  const contrasena = document.getElementById('contrasena').value;
  const mensajeError = document.getElementById('mensaje-error');
  mensajeError.textContent = '';

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: correo,
    password: contrasena,
  });

  if (error) {
    mensajeError.textContent = 'Correo o contraseña incorrectos.';
    return;
  }

  await cargarUsuarioActual();
  const esAdmin = usuarioActual?.rol === 'administrador';
  inyectarShell(esAdmin);
  mostrarPantalla('pantalla-sintomas');
  cargarSintomas();
});

// ── Recuperar contraseña ──────────────────────────────────────────────────────
document.getElementById('link-recuperar').addEventListener('click', async () => {
  const correo = await mostrarPrompt('Recuperar contraseña', 'tu@correo.com');
  if (!correo) return;

  const { error } = await supabaseClient.auth.resetPasswordForEmail(correo);
  if (error) {
    await mostrarAlerta('Error', 'No se pudo enviar el correo de recuperación.');
  } else {
    await mostrarAlerta('Correo enviado', 'Revisa tu bandeja de entrada para restablecer tu contraseña.');
  }
});

// ── Síntomas ──────────────────────────────────────────────────────────────────
async function cargarSintomas() {
  try {
    listaSintomas = await apiFetch('/api/sintomas');

    const categorias = {
      respiratorio: document.getElementById('cat-respiratorio'),
      gastrointestinal: document.getElementById('cat-gastrointestinal'),
      general: document.getElementById('cat-general'),
    };

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
    await mostrarAlerta('Sin conexión', 'No se pudo conectar con el servidor. Verifica que la API esté corriendo.');
  }
}

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

// ── Analizar síntomas ─────────────────────────────────────────────────────────
document.getElementById('btn-analizar').addEventListener('click', async () => {
  if (sintomasSeleccionados.length === 0) {
    await mostrarAlerta('Sin síntomas', 'Debe seleccionar al menos un síntoma antes de continuar.');
    return;
  }

  const btn = document.getElementById('btn-analizar');
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.innerHTML = `<span class="loading-spinner"></span> Analizando...`;

  try {
    const resultado = await apiFetch('/api/diagnosticar', {
      method: 'POST',
      body: JSON.stringify({ sintomas: sintomasSeleccionados }),
    });

    ultimoResultado = resultado;
    mostrarResultado(resultado);
    mostrarPantalla('pantalla-resultado');
  } catch (error) {
    console.error('Error al diagnosticar:', error);
    await mostrarAlerta('Error', 'No se pudo procesar el diagnóstico. Intente nuevamente.');
  } finally {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.innerHTML = `Analizar Síntomas <span class="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>`;
  }
});

// ── Mostrar resultado ─────────────────────────────────────────────────────────
function mostrarResultado(resultado) {
  const banner = document.getElementById('banner-advertencia');
  banner.style.display = resultado.confianza_suficiente ? 'none' : 'block';

  const diagnosticos = resultado.diagnosticos;
  const principal = diagnosticos[0];

  document.getElementById('resultado-principal').innerHTML = `
    <div class="nombre-enfermedad">${principal.enfermedad}</div>
    <div class="confianza-header">
      <span class="confianza-label">Nivel de confianza</span>
      <span class="confianza-valor">${principal.confianza}%</span>
    </div>
    <div class="barra-confianza">
      <div class="barra-confianza-fill" style="width:${principal.confianza}%"></div>
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

// ── Confirmar / Descartar ─────────────────────────────────────────────────────
document.getElementById('btn-confirmar').addEventListener('click', async () => {
  if (!ultimoResultado?.consulta_id) {
    await mostrarAlerta('Error', 'No se encontró la consulta a confirmar.');
    return;
  }

  try {
    await apiFetch(`/api/consultas/${ultimoResultado.consulta_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ decision_medico: 'confirmado' }),
    });
    await mostrarAlerta('Confirmado', 'Diagnóstico confirmado y registrado.');
    reiniciarConsulta();
  } catch {
    await mostrarAlerta('Error', 'No se pudo guardar la confirmación.');
  }
});

document.getElementById('btn-descartar').addEventListener('click', async () => {
  if (!ultimoResultado?.consulta_id) {
    await mostrarAlerta('Error', 'No se encontró la consulta a descartar.');
    return;
  }

  const diagnosticoDefinitivo = await mostrarPrompt('Diagnóstico definitivo', 'Escriba el diagnóstico del médico...');
  if (!diagnosticoDefinitivo) return;

  try {
    await apiFetch(`/api/consultas/${ultimoResultado.consulta_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ decision_medico: 'descartado', diagnostico_definitivo: diagnosticoDefinitivo }),
    });
    await mostrarAlerta('Registrado', `Sugerencia descartada. Diagnóstico registrado: ${diagnosticoDefinitivo}`);
    reiniciarConsulta();
  } catch {
    await mostrarAlerta('Error', 'No se pudo guardar el descarte.');
  }
});

document.getElementById('btn-nueva-consulta').addEventListener('click', reiniciarConsulta);

function reiniciarConsulta() {
  sintomasSeleccionados = [];
  document.querySelectorAll('.btn-sintoma').forEach(b => b.classList.remove('seleccionado'));
  document.getElementById('contador-sintomas').textContent = '0 síntomas';
  mostrarPantalla('pantalla-sintomas');
}

// ── Historial ─────────────────────────────────────────────────────────────────
document.getElementById('btn-ver-historial').addEventListener('click', async () => {
  await cargarHistorial();
  mostrarPantalla('pantalla-historial');
});

async function cargarHistorial() {
  const lista = document.getElementById('lista-historial');
  lista.innerHTML = '<p class="estado-vacio">Cargando...</p>';

  try {
    const consultas = await apiFetch('/api/consultas');

    if (consultas.length === 0) {
      lista.innerHTML = '<p class="estado-vacio">No hay consultas registradas en este turno.</p>';
      return;
    }

    lista.innerHTML = '';
    consultas.forEach(c => {
      const fecha = new Date(c.fecha + 'Z');
      const hora = fecha.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guatemala' });
      const diagnosticoPrincipal = c.resultado?.diagnosticos?.[0];
      const pendiente = !c.decision_medico;

      const estadoBadge = c.decision_medico === 'confirmado'
        ? '<span style="color:#2E7D32; font-weight:600;">✓ Confirmado</span>'
        : c.decision_medico === 'descartado'
        ? '<span style="color:#C62828; font-weight:600;">✗ Descartado</span>'
        : '<span style="color:#999;">Pendiente</span>';

      const div = document.createElement('div');
      div.className = 'historial-card';
      div.style.cursor = 'pointer';
      div.innerHTML = `
        <div class="historial-hora">${hora} — ${estadoBadge}</div>
        <div class="historial-diagnostico">
          ${diagnosticoPrincipal ? diagnosticoPrincipal.enfermedad + ' — ' + diagnosticoPrincipal.confianza + '%' : 'Sin diagnóstico'}
        </div>
        <div class="historial-sintomas">Síntomas: ${c.sintomas_ingresados.join(', ')}</div>
        <div class="historial-detalle" style="display:none; margin-top:12px;"></div>
      `;

      const detalle = div.querySelector('.historial-detalle');

      div.addEventListener('click', async (e) => {
        if (e.target.closest('.historial-accion')) return;

        const abierto = detalle.style.display === 'block';
        document.querySelectorAll('.historial-detalle').forEach(d => d.style.display = 'none');
        detalle.style.display = abierto ? 'none' : 'block';

        if (!abierto && detalle.innerHTML === '') {
          if (pendiente) {
            detalle.innerHTML = `
              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button class="historial-accion btn-toggle activar" data-id="${c.id}" data-accion="confirmar">Confirmar diagnóstico</button>
                <button class="historial-accion btn-toggle desactivar" data-id="${c.id}" data-accion="descartar">Descartar sugerencia</button>
              </div>
            `;
            detalle.querySelectorAll('.historial-accion').forEach(btn => {
              btn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                const id = btn.dataset.id;
                const accion = btn.dataset.accion;

                if (accion === 'confirmar') {
                  await apiFetch(`/api/consultas/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ decision_medico: 'confirmado' }),
                  });
                } else {
                  const diagnosticoDefinitivo = await mostrarPrompt('Diagnóstico definitivo', 'Escriba el diagnóstico del médico...');
                  if (!diagnosticoDefinitivo) return;
                  await apiFetch(`/api/consultas/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ decision_medico: 'descartado', diagnostico_definitivo: diagnosticoDefinitivo }),
                  });
                }
                await cargarHistorial();
              });
            });
          } else {
            detalle.innerHTML = `<div class="historial-sintomas">Diagnóstico definitivo: ${c.diagnostico_definitivo || (diagnosticoPrincipal ? diagnosticoPrincipal.enfermedad : '—')}</div>`;
          }
        }
      });

      lista.appendChild(div);
    });

  } catch (error) {
    console.error('Error cargando historial:', error);
    lista.innerHTML = '<p class="estado-vacio">Error al cargar el historial.</p>';
  }
}

// ── Panel de administración ───────────────────────────────────────────────────
document.getElementById('btn-agregar-usuario').addEventListener('click', async () => {
  const nombre = await mostrarPrompt('Nombre del usuario', 'Nombre completo');
  if (!nombre) return;

  const correo = await mostrarPrompt('Correo electrónico', 'usuario@salud.gob.gt');
  if (!correo) return;

  const rol = await mostrarPrompt('Rol', 'medico / enfermeria / administrador');
  if (!rol || !['medico', 'enfermeria', 'administrador'].includes(rol)) {
    await mostrarAlerta('Rol inválido', 'Debe ser: medico, enfermeria o administrador.');
    return;
  }

  try {
    await apiFetch('/api/usuarios', {
      method: 'POST',
      body: JSON.stringify({ nombre, correo, rol }),
    });
    await mostrarAlerta('Usuario agregado', 'Se envió la invitación por correo al nuevo usuario.');
    await cargarPanelAdmin();
  } catch (error) {
    await mostrarAlerta('Error', error.message || 'No se pudo agregar el usuario.');
  }
});

async function cargarPanelAdmin() {
  try {
    const [usuarios, consultas] = await Promise.all([
      apiFetch('/api/usuarios'),
      apiFetch('/api/consultas'),
    ]);

    // Estadísticas
    document.getElementById('stat-usuarios-activos').textContent = usuarios.filter(u => u.activo).length;
    const hoy = new Date().toISOString().split('T')[0];
    const consultasHoy = consultas.filter(c => c.fecha.startsWith(hoy));
    document.getElementById('stat-consultas-hoy').textContent = consultasHoy.length;

    // ── Diagnósticos del día agrupados ──
    const container = document.getElementById('diagnosticos-dia-container');
    if (consultasHoy.length === 0) {
      container.innerHTML = '<p class="text-body-md text-on-surface-variant" style="padding:20px 0; text-align:center;">Sin consultas registradas hoy.</p>';
    } else {
      // Contar enfermedades
      const conteo = {};
      consultasHoy.forEach(c => {
        const enfermedad = c.resultado?.diagnosticos?.[0]?.enfermedad || 'Sin diagnóstico';
        conteo[enfermedad] = (conteo[enfermedad] || 0) + 1;
      });

      // Ordenar de mayor a menor
      const ordenado = Object.entries(conteo).sort((a, b) => b[1] - a[1]);

      container.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
          ${ordenado.map(([enfermedad, cantidad]) => `
            <div class="diagnostico-dia-card">
              <span class="diagnostico-dia-nombre">${enfermedad}</span>
              <span class="diagnostico-dia-count">${cantidad}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Tabla de usuarios
    const tbody = document.getElementById('tabla-usuarios-body');
    tbody.innerHTML = '';
    usuarios.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.nombre}</td>
        <td>${u.correo}</td>
        <td><span class="rol-badge rol-${u.rol}">${u.rol}</span></td>
        <td>${u.activo ? 'Activo' : 'Inactivo'}</td>
        <td>
          <button class="btn-toggle ${u.activo ? 'desactivar' : 'activar'}" data-id="${u.id}" data-activo="${u.activo}">
            ${u.activo ? 'Desactivar' : 'Activar'}
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const activoActual = btn.dataset.activo === 'true';
        await apiFetch(`/api/usuarios/${btn.dataset.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ activo: !activoActual }),
        });
        await cargarPanelAdmin();
      });
    });

  } catch (error) {
    console.error('Error cargando panel admin:', error);
  }
}