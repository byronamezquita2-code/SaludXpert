const SUPABASE_URL = 'https://bpisojfqhsaisfvnwhpr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_I0o7hKokgpc5hyIcBZeRQg_nLHEm60L';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const API_URL = 'https://saludxpert-api.onrender.com';

let sintomasSeleccionados = [];
let listaSintomas = [];
let ultimoResultado = null;
let usuarioActual = null;
let pacienteActual = null;
let busquedaPacienteTimeout = null;

async function cerrarSesionForzada(mensaje) {
  await supabaseClient.auth.signOut();
  usuarioActual = null;
  mostrarPantalla('pantalla-login');
  document.getElementById('mensaje-error').textContent = mensaje;
}

async function apiFetch(path, options = {}) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const token = sessionData?.session?.access_token;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error('Sin conexión — revisa tu internet e intenta de nuevo.');
  }

  if (response.status === 401) {
    await cerrarSesionForzada('Tu sesión expiró. Inicia sesión de nuevo.');
    throw new Error('Tu sesión expiró. Inicia sesión de nuevo.');
  }

  if (response.status === 403) {
    const body = await response.clone().json().catch(() => ({}));
    if (body.codigo === 'cuenta_inactiva' || body.codigo === 'sin_registro') {
      await cerrarSesionForzada(body.error);
      throw new Error(body.error);
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Error ${response.status}`);
  }

  return response.json();
}

const appDialog = document.getElementById('app-dialog');
const dialogTitle = document.getElementById('dialog-title');
const dialogBody = document.getElementById('dialog-body');
const dialogInput = document.getElementById('dialog-input');
const dialogConfirm = document.getElementById('dialog-confirm');
const dialogCancel = document.getElementById('dialog-cancel');

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

function fadeIn(selector, opts = {}) {
  if (typeof gsap === 'undefined') return;
  const elementos = typeof selector === 'string' ? document.querySelectorAll(selector) : selector;
  if (!elementos || !elementos.length) return;
  gsap.fromTo(elementos,
    { opacity: 0, y: 14 },
    { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', stagger: 0.06, ...opts }
  );
}

function mostrarPantalla(id) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  const pantalla = document.getElementById(id);
  pantalla.classList.add('activa');

  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('nav-link-active'));
  const mapa = {
    'pantalla-paciente': 'nav-nueva',
    'pantalla-sintomas': 'nav-nueva',
    'pantalla-resultado': 'nav-nueva',
    'pantalla-historial': 'nav-historial',
    'pantalla-admin': 'nav-admin',
  };
  const activo = mapa[id];
  if (activo) {
    document.querySelectorAll(`.${activo}`).forEach(l => l.classList.add('nav-link-active'));
  }

  if (typeof gsap !== 'undefined') {
    const titulo = pantalla.querySelector('h1');
    if (titulo) fadeIn(titulo, { y: -10, stagger: 0 });
  }
}

function logoSVG() {
  return `<svg class="w-7 h-7 text-primary" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L3 6v6c0 5 4 9 9 10 5-1 9-5 9-10V6l-9-4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
}

function sidebarHTML(rol) {
  const esAdmin = rol === 'administrador';
  const esMedico = rol === 'medico';
  const adminLink = (esAdmin || esMedico)
    ? `<span class="nav-link nav-admin" id="nav-admin-link" role="button" tabindex="0" aria-label="${esAdmin ? 'Administración' : 'Equipo'}">
         <span class="material-symbols-outlined mr-md" aria-hidden="true">${esAdmin ? 'admin_panel_settings' : 'groups'}</span>
         <span class="font-label-md text-label-md">${esAdmin ? 'Administración' : 'Equipo'}</span>
       </span>`
    : '';

  return `
    <div class="h-16 flex items-center px-6 gap-sm border-b border-outline-variant">
      ${logoSVG()}
      <span class="font-headline-sm text-headline-sm text-primary">SaludXpert</span>
    </div>
    <nav class="flex-1 flex flex-col gap-xs px-md pt-lg" aria-label="Navegación principal">
      <span class="nav-link nav-nueva" id="nav-nueva-link" role="button" tabindex="0" aria-label="Nueva Consulta">
        <span class="material-symbols-outlined mr-md" aria-hidden="true">add_circle</span>
        <span class="font-label-md text-label-md">Nueva Consulta</span>
      </span>
      <span class="nav-link nav-historial" id="nav-historial-link" role="button" tabindex="0" aria-label="Historial">
        <span class="material-symbols-outlined mr-md" aria-hidden="true">history</span>
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

function inyectarShell(rol) {
  const pantallas = ['paciente', 'sintomas', 'resultado', 'historial', 'admin'];
  pantallas.forEach(p => {
    const sidebar = document.getElementById(`sidebar-${p}`);
    const topbar = document.getElementById(`topbar-${p}`);
    if (sidebar) sidebar.innerHTML = sidebarHTML(rol);
    if (topbar) topbar.innerHTML = topbarHTML();
  });
  registrarEventosShell();
}

function activarConTeclado(el) {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el.click();
    }
  });
}

function registrarEventosShell() {
  document.querySelectorAll('#nav-nueva-link').forEach(el => {
    el.addEventListener('click', reiniciarConsulta);
    activarConTeclado(el);
  });

  document.querySelectorAll('#nav-historial-link').forEach(el => {
    el.addEventListener('click', async () => {
      await cargarHistorial();
      mostrarPantalla('pantalla-historial');
    });
    activarConTeclado(el);
  });

  document.querySelectorAll('#nav-admin-link').forEach(el => {
    el.addEventListener('click', async () => {
      await cargarPanelAdmin();
      mostrarPantalla('pantalla-admin');
    });
    activarConTeclado(el);
  });

  document.querySelectorAll('.btn-logout').forEach(btn =>
    btn.addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      usuarioActual = null;
      document.getElementById('correo').value = '';
      document.getElementById('contrasena').value = '';
      mostrarPantalla('pantalla-login');
    }));
}

function capitalizar(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function actualizarTopbarUsuario() {
  document.querySelectorAll('.topbar-usuario-nombre').forEach(el => {
    el.textContent = usuarioActual ? usuarioActual.nombre : '';
  });
  document.querySelectorAll('.topbar-usuario-rol').forEach(el => {
    el.textContent = usuarioActual ? capitalizar(usuarioActual.rol) : '';
  });
}

async function cargarUsuarioActual() {
  usuarioActual = null;
  try {
    const data = await apiFetch('/api/usuarios/me');
    usuarioActual = { correo: data.correo, nombre: data.nombre, rol: data.rol };
  } catch {
  }
  actualizarTopbarUsuario();
  return usuarioActual !== null;
}

function renderBannerPaciente(elementId) {
  const el = document.getElementById(elementId);
  if (!el || !pacienteActual) {
    if (el) el.innerHTML = '';
    return;
  }

  const antecedentes = [
    pacienteActual.alergias ? `<div class="paciente-antecedente paciente-alerta">⚠ Alergias: <strong>${escaparHtml(pacienteActual.alergias)}</strong></div>` : '',
    pacienteActual.condiciones_cronicas ? `<div class="paciente-antecedente">Condiciones crónicas: <strong>${escaparHtml(pacienteActual.condiciones_cronicas)}</strong></div>` : '',
    pacienteActual.medicamentos_actuales ? `<div class="paciente-antecedente">Medicamentos actuales: <strong>${escaparHtml(pacienteActual.medicamentos_actuales)}</strong></div>` : '',
  ].join('');

  el.innerHTML = `
    <div class="banner-paciente">
      <span class="paciente-nombre">${escaparHtml(pacienteActual.nombre)}</span>
      ${antecedentes || '<div class="paciente-antecedente">Sin antecedentes registrados.</div>'}
    </div>
  `;
}

function irAPantallaPaciente() {
  pacienteActual = null;
  sintomasSeleccionados = [];
  const buscarInput = document.getElementById('buscar-paciente');
  if (buscarInput) buscarInput.value = '';
  const resultados = document.getElementById('resultados-paciente');
  if (resultados) resultados.innerHTML = '';
  if (document.getElementById('form-nuevo-paciente')) salirModoEdicionPaciente();
  mostrarPantalla('pantalla-paciente');
}

async function seleccionarPaciente(paciente) {
  pacienteActual = paciente;
  renderBannerPaciente('banner-paciente-sintomas');
  mostrarPantalla('pantalla-sintomas');
  await cargarSintomas();
}

async function restaurarSesion() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (sessionData?.session) {
    if (!(await cargarUsuarioActual())) {
      const mensaje = document.getElementById('mensaje-error');
      if (!mensaje.textContent) mensaje.textContent = 'No se pudo cargar tu perfil. Revisa tu conexión e inicia sesión de nuevo.';
      return;
    }
    inyectarShell(usuarioActual.rol);
    irAPantallaPaciente();
  }
}

function esEnlaceDeInvitacionORecuperacion() {
  return /type=invite|type=recovery/.test(window.location.hash);
}

async function esperarSesionDesdeEnlace(intentos = 20) {
  for (let i = 0; i < intentos; i++) {
    const { data } = await supabaseClient.auth.getSession();
    if (data?.session) return true;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

function hayErrorEnEnlace() {
  return /[#&]error(_code|_description)?=/.test(window.location.hash);
}

async function manejarEnlaceEspecial() {
  if (hayErrorEnEnlace()) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    mostrarPantalla('pantalla-login');
    await mostrarAlerta(
      'Enlace expirado o ya usado',
      'Este enlace ya no sirve. Si es tu primera vez, pide al administrador que te reenvíe la invitación; si ya tienes cuenta, usa "¿Olvidaste tu contraseña?".'
    );
    return true;
  }
  if (!esEnlaceDeInvitacionORecuperacion()) return false;

  const sesionLista = await esperarSesionDesdeEnlace();

  history.replaceState(null, '', window.location.pathname + window.location.search);

  if (!sesionLista) {
    await mostrarAlerta('Enlace inválido', 'Este enlace ya no es válido o expiró. Solicita uno nuevo.');
    mostrarPantalla('pantalla-login');
    return true;
  }

  mostrarPantalla('pantalla-nueva-contrasena');
  return true;
}

document.getElementById('form-nueva-contrasena').addEventListener('submit', async (e) => {
  e.preventDefault();

  const nueva = document.getElementById('nueva-contrasena').value;
  const confirmar = document.getElementById('confirmar-contrasena').value;
  const mensajeError = document.getElementById('mensaje-error-nueva-contrasena');
  mensajeError.textContent = '';

  if (nueva !== confirmar) {
    mensajeError.textContent = 'Las contraseñas no coinciden.';
    return;
  }
  if (nueva.length < 12) {
    mensajeError.textContent = 'La contraseña debe tener al menos 12 caracteres.';
    return;
  }

  const { error } = await supabaseClient.auth.updateUser({ password: nueva });
  if (error) {
    mensajeError.textContent = error.code === 'weak_password'
      ? 'La contraseña es muy débil. Usa 12 o más caracteres, con mayúsculas, minúsculas y números.'
      : 'No se pudo guardar la contraseña. Intenta de nuevo.';
    return;
  }

  if (!(await cargarUsuarioActual())) {
    await mostrarAlerta('Cuenta no disponible', document.getElementById('mensaje-error').textContent || 'No se pudo cargar tu perfil.');
    return;
  }
  inyectarShell(usuarioActual.rol);
  irAPantallaPaciente();
});

(async function iniciarApp() {
  fadeIn('#pantalla-login h1', { y: -10, stagger: 0 });
  fadeIn('#form-login', { delay: 0.1, stagger: 0 });

  const manejadoPorEnlaceEspecial = await manejarEnlaceEspecial();
  if (!manejadoPorEnlaceEspecial) {
    await restaurarSesion();
  }
})();

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

  if (!(await cargarUsuarioActual())) {
    if (!mensajeError.textContent) mensajeError.textContent = 'No se pudo cargar tu perfil. Revisa tu conexión e intenta de nuevo.';
    return;
  }
  inyectarShell(usuarioActual.rol);
  irAPantallaPaciente();
});

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

function entrarModoEdicionPaciente(p) {
  const form = document.getElementById('form-nuevo-paciente');
  form.dataset.editandoId = p.id;

  document.getElementById('paciente-nombre').value = p.nombre || '';
  document.getElementById('paciente-documento').value = p.documento || '';
  document.getElementById('paciente-nacimiento').value = p.fecha_nacimiento || '';
  document.getElementById('paciente-alergias').value = p.alergias || '';
  document.getElementById('paciente-condiciones').value = p.condiciones_cronicas || '';
  document.getElementById('paciente-medicamentos').value = p.medicamentos_actuales || '';

  document.getElementById('texto-form-paciente').textContent = `Editando a ${p.nombre}`;
  document.getElementById('btn-guardar-paciente').textContent = 'Guardar cambios y continuar';
  document.getElementById('btn-cancelar-edicion-paciente').style.display = '';

  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function salirModoEdicionPaciente() {
  const form = document.getElementById('form-nuevo-paciente');
  form.dataset.editandoId = '';
  form.reset();

  document.getElementById('texto-form-paciente').textContent = 'o registre uno nuevo';
  document.getElementById('btn-guardar-paciente').textContent = 'Registrar y continuar';
  document.getElementById('btn-cancelar-edicion-paciente').style.display = 'none';
}

document.getElementById('btn-cancelar-edicion-paciente').addEventListener('click', salirModoEdicionPaciente);

document.getElementById('buscar-paciente').addEventListener('input', (e) => {
  const termino = e.target.value.trim();
  clearTimeout(busquedaPacienteTimeout);

  const contenedor = document.getElementById('resultados-paciente');
  if (termino.length < 2) {
    contenedor.innerHTML = '';
    return;
  }

  busquedaPacienteTimeout = setTimeout(async () => {
    try {
      const pacientes = await apiFetch(`/api/pacientes?buscar=${encodeURIComponent(termino)}`);
      contenedor.innerHTML = '';

      if (pacientes.length === 0) {
        contenedor.innerHTML = '<p class="estado-vacio" style="padding:20px;">Sin resultados. Regístrelo abajo si es un paciente nuevo.</p>';
        return;
      }

      pacientes.forEach(p => {
        const div = document.createElement('div');
        div.className = 'resultado-paciente historial-card';
        div.innerHTML = `
          <div class="flex items-center justify-between gap-sm">
            <div>
              <span class="paciente-nombre">${escaparHtml(p.nombre)}</span>
              ${p.documento ? `<div class="paciente-doc">CUI/DPI: ${escaparHtml(p.documento)}</div>` : ''}
            </div>
            <button type="button" class="link-secundario btn-editar-paciente">Editar</button>
          </div>
        `;
        div.addEventListener('click', () => seleccionarPaciente(p));
        div.querySelector('.btn-editar-paciente').addEventListener('click', (ev) => {
          ev.stopPropagation();
          entrarModoEdicionPaciente(p);
        });
        contenedor.appendChild(div);
      });

      fadeIn('.resultado-paciente', { y: 8, stagger: 0.04, duration: 0.3 });
    } catch (error) {
      contenedor.innerHTML = '';
      console.error('Error buscando pacientes:', error);
    }
  }, 300);
});

document.getElementById('form-nuevo-paciente').addEventListener('submit', async (e) => {
  e.preventDefault();

  const nombre = document.getElementById('paciente-nombre').value.trim();
  if (!nombre) return;

  const cuerpo = {
    nombre,
    documento: document.getElementById('paciente-documento').value.trim() || null,
    fecha_nacimiento: document.getElementById('paciente-nacimiento').value || null,
    alergias: document.getElementById('paciente-alergias').value.trim() || null,
    condiciones_cronicas: document.getElementById('paciente-condiciones').value.trim() || null,
    medicamentos_actuales: document.getElementById('paciente-medicamentos').value.trim() || null,
  };

  const form = e.target;
  const editandoId = form.dataset.editandoId;

  try {
    const paciente = editandoId
      ? await apiFetch(`/api/pacientes/${editandoId}`, { method: 'PATCH', body: JSON.stringify(cuerpo) })
      : await apiFetch('/api/pacientes', { method: 'POST', body: JSON.stringify(cuerpo) });

    salirModoEdicionPaciente();
    await seleccionarPaciente(paciente);
  } catch (error) {
    await mostrarAlerta('Error', error.message || 'No se pudo guardar el paciente.');
  }
});

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

    fadeIn('#pantalla-sintomas .bg-surface-container-lowest.shadow-sm', { stagger: 0.08 });
    fadeIn('.btn-sintoma', { y: 8, stagger: 0.02, duration: 0.3 });
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

document.getElementById('btn-analizar').addEventListener('click', async () => {
  if (!pacienteActual) {
    await mostrarAlerta('Falta el paciente', 'Seleccione o registre un paciente antes de continuar.');
    irAPantallaPaciente();
    return;
  }
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
      body: JSON.stringify({ sintomas: sintomasSeleccionados, paciente_id: pacienteActual.id }),
    });

    ultimoResultado = resultado;
    mostrarResultado(resultado);
    mostrarPantalla('pantalla-resultado');
  } catch (error) {
    console.error('Error al diagnosticar:', error);
    await mostrarAlerta('Error', error.message || 'No se pudo procesar el diagnóstico. Intente nuevamente.');
  } finally {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    btn.innerHTML = `Analizar Síntomas <span class="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>`;
  }
});

function mostrarResultado(resultado) {
  renderBannerPaciente('banner-paciente-resultado');

  const banner = document.getElementById('banner-advertencia');
  banner.style.display = resultado.confianza_suficiente ? 'none' : 'block';

  const puedeDecidir = ['medico', 'administrador'].includes(usuarioActual?.rol);
  document.getElementById('btn-confirmar').style.display = puedeDecidir ? '' : 'none';
  document.getElementById('btn-descartar').style.display = puedeDecidir ? '' : 'none';

  const diagnosticos = resultado.diagnosticos;
  const principal = diagnosticos[0];

  document.getElementById('resultado-principal').innerHTML = `
    <div class="nombre-enfermedad">${escaparHtml(principal.enfermedad)}</div>
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
    div.innerHTML = `<span>${escaparHtml(d.enfermedad)}</span><span>${d.confianza}%</span>`;
    alternativosDiv.appendChild(div);
  });

  fadeIn('#resultado-principal .nombre-enfermedad', { y: -8, stagger: 0 });
  fadeIn('.alt-card', { stagger: 0.08 });
}

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
  } catch (error) {
    await mostrarAlerta('Error', error.message || 'No se pudo guardar la confirmación.');
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
  } catch (error) {
    await mostrarAlerta('Error', error.message || 'No se pudo guardar el descarte.');
  }
});

document.getElementById('btn-nueva-consulta').addEventListener('click', reiniciarConsulta);

function reiniciarConsulta() {
  document.querySelectorAll('.btn-sintoma').forEach(b => b.classList.remove('seleccionado'));
  document.getElementById('contador-sintomas').textContent = '0 síntomas';
  irAPantallaPaciente();
}

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
      const puedeDecidir = ['medico', 'administrador'].includes(usuarioActual?.rol);

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
          ${diagnosticoPrincipal ? escaparHtml(diagnosticoPrincipal.enfermedad) + ' — ' + diagnosticoPrincipal.confianza + '%' : 'Sin diagnóstico'}
        </div>
        <div class="historial-sintomas">Paciente: ${c.pacientes?.nombre ? escaparHtml(c.pacientes.nombre) : 'Sin registrar'}</div>
        <div class="historial-sintomas">Síntomas: ${escaparHtml(c.sintomas_ingresados.join(', '))}</div>
        <div class="historial-detalle" style="display:none; margin-top:12px;"></div>
      `;

      const detalle = div.querySelector('.historial-detalle');

      div.addEventListener('click', async (e) => {
        if (e.target.closest('.historial-accion')) return;

        const abierto = detalle.style.display === 'block';
        document.querySelectorAll('.historial-detalle').forEach(d => d.style.display = 'none');
        detalle.style.display = abierto ? 'none' : 'block';

        if (!abierto && detalle.innerHTML === '') {
          if (pendiente && puedeDecidir) {
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

                try {
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
                } catch (error) {
                  await mostrarAlerta('Error', error.message || 'No se pudo guardar el cambio.');
                }
              });
            });
          } else if (pendiente) {
            detalle.innerHTML = `<div class="historial-sintomas">Pendiente de confirmación por un médico o administrador.</div>`;
          } else {
            detalle.innerHTML = `<div class="historial-sintomas">Diagnóstico definitivo: ${escaparHtml(c.diagnostico_definitivo || (diagnosticoPrincipal ? diagnosticoPrincipal.enfermedad : '—'))}</div>`;
          }
        }
      });

      lista.appendChild(div);
    });

    fadeIn('.historial-card', { stagger: 0.05 });

  } catch (error) {
    console.error('Error cargando historial:', error);
    lista.innerHTML = '<p class="estado-vacio">Error al cargar el historial.</p>';
  }
}

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
  const esAdmin = usuarioActual?.rol === 'administrador';

  document.getElementById('titulo-panel-admin').textContent = esAdmin
    ? 'Panel de Administración'
    : 'Equipo y Diagnósticos del Día';
  document.getElementById('subtitulo-panel-admin').textContent = esAdmin
    ? 'Gestión de usuarios y métricas del sistema.'
    : 'Médicos activos en el sistema y estadísticas del día.';
  document.getElementById('label-stat-usuarios').textContent = esAdmin
    ? 'Usuarios activos'
    : 'Médicos en el sistema';
  document.getElementById('titulo-tabla-usuarios').textContent = esAdmin
    ? 'Gestión de Usuarios'
    : 'Médicos Usando el Sistema';

  const btnAgregar = document.getElementById('btn-agregar-usuario');
  if (btnAgregar) btnAgregar.style.display = esAdmin ? '' : 'none';
  const thAcciones = document.getElementById('th-acciones');
  if (thAcciones) thAcciones.style.display = esAdmin ? '' : 'none';

  try {
    const [usuarios, consultas] = await Promise.all([
      apiFetch('/api/usuarios'),
      apiFetch('/api/consultas'),
    ]);

    document.getElementById('stat-usuarios-activos').textContent = esAdmin
      ? usuarios.filter(u => u.activo).length
      : usuarios.length;
    const consultasHoy = consultas;
    document.getElementById('stat-consultas-hoy').textContent = consultasHoy.length;

    const container = document.getElementById('diagnosticos-dia-container');
    if (consultasHoy.length === 0) {
      container.innerHTML = '<p class="text-body-md text-on-surface-variant" style="padding:20px 0; text-align:center;">Sin consultas registradas hoy.</p>';
    } else {
      const conteo = {};
      consultasHoy.forEach(c => {
        const enfermedad = c.resultado?.diagnosticos?.[0]?.enfermedad || 'Sin diagnóstico';
        conteo[enfermedad] = (conteo[enfermedad] || 0) + 1;
      });

      const ordenado = Object.entries(conteo).sort((a, b) => b[1] - a[1]);

      container.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
          ${ordenado.map(([enfermedad, cantidad]) => `
            <div class="diagnostico-dia-card">
              <span class="diagnostico-dia-nombre">${escaparHtml(enfermedad)}</span>
              <span class="diagnostico-dia-count">${cantidad}</span>
            </div>
          `).join('')}
        </div>
      `;
      fadeIn('.diagnostico-dia-card', { stagger: 0.05 });
    }

    const tbody = document.getElementById('tabla-usuarios-body');
    tbody.innerHTML = '';
    usuarios.forEach(u => {
      const tr = document.createElement('tr');
      const accionTd = esAdmin
        ? `<td>
            <button class="btn-toggle ${u.activo ? 'desactivar' : 'activar'}" data-id="${u.id}" data-activo="${u.activo}">
              ${u.activo ? 'Desactivar' : 'Activar'}
            </button>
          </td>`
        : '';
      tr.innerHTML = `
        <td>${escaparHtml(u.nombre)}</td>
        <td>${escaparHtml(u.correo)}</td>
        <td><span class="rol-badge rol-${u.rol}">${escaparHtml(u.rol)}</span></td>
        <td>${u.activo ? 'Activo' : 'Inactivo'}</td>
        ${accionTd}
      `;
      tbody.appendChild(tr);
    });

    fadeIn('#tabla-usuarios-body tr', { y: 6, stagger: 0.04, duration: 0.3 });

    if (esAdmin) {
      tbody.querySelectorAll('.btn-toggle').forEach(btn => {
        btn.addEventListener('click', async () => {
          const activoActual = btn.dataset.activo === 'true';
          try {
            await apiFetch(`/api/usuarios/${btn.dataset.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ activo: !activoActual }),
            });
            await cargarPanelAdmin();
          } catch (error) {
            await mostrarAlerta('Error', error.message || 'No se pudo actualizar el usuario.');
          }
        });
      });
    }

  } catch (error) {
    console.error('Error cargando panel admin:', error);
  }
}
