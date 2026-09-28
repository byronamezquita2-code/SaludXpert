const SUPABASE_URL = 'https://bpisojfqhsaisfvnwhpr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_I0o7hKokgpc5hyIcBZeRQg_nLHEm60L';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const API_URL = 'https://saludxpert-api.onrender.com';
const THEME_STORAGE_KEY = 'saludxpert-theme';
let transicionTemaActiva = null;

let sintomasSeleccionados = [];
let listaSintomas = [];
let ultimoResultado = null;
let usuarioActual = null;
let pacienteActual = null;
let busquedaPacienteTimeout = null;
let ultimaActivacionTeclado = 0;

function obtenerTemaActual() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function actualizarControlesTema() {
  const tema = obtenerTemaActual();
  document.querySelectorAll('.theme-option').forEach(boton => {
    const activo = boton.dataset.themeValue === tema;
    boton.classList.toggle('is-active', activo);
    boton.setAttribute('aria-checked', String(activo));
    boton.tabIndex = activo ? 0 : -1;
  });
  document.querySelectorAll('.theme-switcher').forEach(control => {
    control.dataset.activeTheme = tema;
    control.setAttribute('aria-label', tema === 'dark' ? 'Apariencia: modo noche' : 'Apariencia: modo día');
  });
}

function aplicarTema(tema, persistir = true) {
  const temaSeguro = tema === 'dark' ? 'dark' : 'light';
  if (persistir && temaSeguro === obtenerTemaActual()) return;

  const confirmarCambio = () => {
    document.documentElement.dataset.theme = temaSeguro;
    document.documentElement.style.colorScheme = temaSeguro;

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) metaThemeColor.content = temaSeguro === 'dark' ? '#05070b' : '#edf4fc';

    if (persistir) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, temaSeguro);
      } catch {
        // El tema sigue funcionando aunque el navegador bloquee el almacenamiento.
      }
    }

    actualizarControlesTema();
  };

  const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!persistir || reducirMovimiento || typeof document.startViewTransition !== 'function') {
    confirmarCambio();
    return;
  }

  transicionTemaActiva?.skipTransition();
  const transicion = document.startViewTransition(confirmarCambio);
  transicionTemaActiva = transicion;
  transicion.finished.finally(() => {
    if (transicionTemaActiva === transicion) transicionTemaActiva = null;
  });
}

aplicarTema(obtenerTemaActual(), false);

async function cerrarSesionForzada(mensaje) {
  detenerControlInactividad();
  await supabaseClient.auth.signOut();
  usuarioActual = null;
  mostrarPantalla('pantalla-login');
  document.getElementById('mensaje-error').textContent = mensaje;
  revelarLogin({ focus: false, immediate: true });
}

const INACTIVIDAD_LIMITE_MS = 15 * 60 * 1000;
const INACTIVIDAD_AVISO_MS = 60 * 1000;
const ACTIVIDAD_STORAGE_KEY = 'saludxpert-ultima-actividad';
const avisoInactividad = document.getElementById('aviso-inactividad');
const avisoInactividadSegundos = document.getElementById('aviso-inactividad-segundos');
let ultimaActividad = Date.now();
let ultimaActividadGuardada = 0;
let intervaloInactividad = null;

// La última actividad se comparte entre pestañas para no cerrar la sesión
// de una pestaña en uso porque otra quedó abierta sin tocar.
function leerActividadGuardada() {
  try {
    return Number(localStorage.getItem(ACTIVIDAD_STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function leerUltimaActividad() {
  return Math.max(ultimaActividad, leerActividadGuardada());
}

function registrarActividad() {
  if (!intervaloInactividad) return;
  ultimaActividad = Date.now();
  avisoInactividad.hidden = true;
  if (ultimaActividad - ultimaActividadGuardada > 5000) {
    ultimaActividadGuardada = ultimaActividad;
    try {
      localStorage.setItem(ACTIVIDAD_STORAGE_KEY, String(ultimaActividad));
    } catch {}
  }
}

function revisarInactividad() {
  if (!intervaloInactividad || !usuarioActual) return;
  const restante = INACTIVIDAD_LIMITE_MS - (Date.now() - leerUltimaActividad());

  if (restante <= 0) {
    if (appDialog.open) appDialog.close();
    cerrarSesionForzada('Tu sesión se cerró por inactividad. Inicia sesión de nuevo.');
    return;
  }
  if (restante <= INACTIVIDAD_AVISO_MS) {
    avisoInactividadSegundos.textContent = Math.ceil(restante / 1000);
    avisoInactividad.hidden = false;
  } else {
    avisoInactividad.hidden = true;
  }
}

function iniciarControlInactividad() {
  ultimaActividadGuardada = 0;
  if (!intervaloInactividad) intervaloInactividad = setInterval(revisarInactividad, 1000);
  registrarActividad();
}

function detenerControlInactividad() {
  clearInterval(intervaloInactividad);
  intervaloInactividad = null;
  avisoInactividad.hidden = true;
}

['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(evento =>
  document.addEventListener(evento, registrarActividad, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') revisarInactividad();
});
document.getElementById('btn-seguir-conectado').addEventListener('click', registrarActividad);

const avisoConexion = document.getElementById('aviso-conexion');
let peticionesLentas = 0;

async function apiFetch(path, options = {}) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const token = sessionData?.session?.access_token;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  // El plan gratuito de Render se duerme; si tarda, avisar en vez de parecer colgado.
  let marcadaLenta = false;
  const temporizadorLento = setTimeout(() => {
    marcadaLenta = true;
    peticionesLentas++;
    avisoConexion.hidden = false;
  }, 4000);

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error('Sin conexión — revisa tu internet e intenta de nuevo.');
  } finally {
    clearTimeout(temporizadorLento);
    if (marcadaLenta && --peticionesLentas === 0) avisoConexion.hidden = true;
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
    if (body.codigo === 'mfa_requerida') {
      detenerControlInactividad();
      await iniciarVerificacionMfa();
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

function mostrarConfirmacion(titulo, mensaje, textoConfirmar = 'Aceptar') {
  return new Promise(resolve => {
    dialogTitle.textContent = titulo;
    dialogBody.textContent = mensaje;
    dialogInput.style.display = 'none';
    dialogCancel.style.display = '';
    dialogConfirm.textContent = textoConfirmar;

    const terminar = (valor) => {
      dialogConfirm.removeEventListener('click', onConfirm);
      dialogCancel.removeEventListener('click', onCancel);
      appDialog.removeEventListener('cancel', onCancel);
      if (appDialog.open) appDialog.close();
      resolve(valor);
    };
    const onConfirm = () => terminar(true);
    const onCancel = () => terminar(false);

    dialogConfirm.addEventListener('click', onConfirm);
    dialogCancel.addEventListener('click', onCancel);
    appDialog.addEventListener('cancel', onCancel);
    appDialog.showModal();
  });
}

function fadeIn(selector, opts = {}) {
  if (typeof gsap === 'undefined') return;
  const elementos = typeof selector === 'string' ? document.querySelectorAll(selector) : selector;
  if (!elementos || !elementos.length) return;

  const reducirMovimiento = movimientoReducidoActivo();
  const { y = 8, duration = 0.26, stagger = 0.04, ...resto } = opts;
  gsap.killTweensOf(elementos);
  gsap.fromTo(elementos,
    { opacity: 0, y: reducirMovimiento ? 0 : y },
    {
      opacity: 1,
      y: 0,
      duration: reducirMovimiento ? 0.18 : duration,
      ease: 'power2.out',
      stagger: reducirMovimiento ? 0 : stagger,
      clearProps: 'transform,opacity',
      ...resto,
    }
  );
}

const loginPantalla = document.getElementById('pantalla-login');
const loginComposition = loginPantalla.querySelector('.login-composition');
const loginBrand = document.getElementById('login-brand-trigger');
const loginCard = document.getElementById('login-card');
const loginEmail = document.getElementById('correo');
const loginPassword = document.getElementById('contrasena');
const loginSubmit = document.getElementById('login-submit');
const loginError = document.getElementById('mensaje-error');
const passwordToggle = document.getElementById('toggle-contrasena');
let loginRevelado = false;
let loginTimeline = null;

function movimientoReducidoActivo() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function calcularOffsetInicialLogin() {
  const estilos = window.getComputedStyle(loginComposition);
  const gap = Number.parseFloat(estilos.rowGap || estilos.gap) || 0;
  return (loginCard.offsetHeight + gap) / 2;
}

function posicionarLoginInicial() {
  if (loginRevelado || !loginPantalla.classList.contains('activa')) return;

  const offset = calcularOffsetInicialLogin();
  if (typeof gsap !== 'undefined') {
    gsap.set(loginBrand, { y: offset, opacity: 1, scale: 1 });
    gsap.set(loginCard, { autoAlpha: 0, y: 30, scale: 0.97 });
  } else {
    loginBrand.style.transform = `translateY(${offset}px)`;
    loginBrand.style.opacity = '1';
    loginCard.style.opacity = '0';
    loginCard.style.visibility = 'hidden';
  }
}

function prepararLogin() {
  if (loginTimeline) {
    loginTimeline.kill();
    loginTimeline = null;
  }

  loginRevelado = false;
  loginPantalla.classList.remove('login-revealed');
  loginBrand.setAttribute('aria-expanded', 'false');
  loginBrand.setAttribute('aria-label', 'Mostrar formulario de inicio de sesión');
  loginCard.setAttribute('aria-hidden', 'true');
  passwordToggle.setAttribute('aria-pressed', 'false');
  passwordToggle.setAttribute('aria-label', 'Mostrar contraseña');
  passwordToggle.querySelector('.material-symbols-outlined').textContent = 'visibility';
  loginPassword.type = 'password';

  requestAnimationFrame(() => {
    posicionarLoginInicial();
    if (typeof gsap !== 'undefined' && !movimientoReducidoActivo()) {
      gsap.fromTo(
        loginBrand,
        { opacity: 0, scale: 0.97 },
        { opacity: 1, scale: 1, duration: 0.58, ease: 'power2.out', overwrite: 'auto' }
      );
    }
  });
}

function revelarLogin({ focus = true, immediate = false } = {}) {
  if (loginRevelado) {
    if (focus) loginEmail.focus({ preventScroll: true });
    return;
  }

  loginRevelado = true;
  loginPantalla.classList.add('login-revealed');
  loginBrand.setAttribute('aria-expanded', 'true');
  loginBrand.setAttribute('aria-label', 'Ocultar formulario de inicio de sesión');
  loginCard.setAttribute('aria-hidden', 'false');

  const enfocarCorreo = () => {
    loginCard.style.willChange = 'auto';
    loginBrand.style.willChange = 'auto';
    if (focus) loginEmail.focus({ preventScroll: true });
  };

  if (typeof gsap === 'undefined') {
    loginBrand.style.transform = 'translateY(0)';
    loginCard.style.visibility = 'visible';
    loginCard.style.opacity = '1';
    loginCard.style.transform = 'translateY(0) scale(1)';
    enfocarCorreo();
    return;
  }

  if (loginTimeline) loginTimeline.kill();
  gsap.killTweensOf([loginBrand, loginCard]);

  if (immediate || movimientoReducidoActivo()) {
    gsap.set(loginBrand, { y: 0, opacity: 1, scale: 1 });
    gsap.to(loginCard, {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: immediate ? 0 : 0.18,
      ease: 'power2.out',
      onComplete: enfocarCorreo,
    });
    return;
  }

  loginTimeline = gsap.timeline();
  loginTimeline
    .to(loginBrand, {
      y: 0,
      duration: 0.78,
      ease: 'power3.out',
    })
    .to(loginCard, {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: 0.64,
      ease: 'power3.out',
      onComplete: enfocarCorreo,
    }, '-=0.42');
}

function cerrarLogin({ immediate = false } = {}) {
  if (!loginRevelado) return;

  loginRevelado = false;
  loginBrand.setAttribute('aria-expanded', 'false');
  loginBrand.setAttribute('aria-label', 'Mostrar formulario de inicio de sesión');
  loginCard.setAttribute('aria-hidden', 'true');

  if (loginCard.contains(document.activeElement)) {
    loginBrand.focus({ preventScroll: true });
  }

  const offset = calcularOffsetInicialLogin();
  const finalizarCierre = () => {
    loginPantalla.classList.remove('login-revealed');
    loginCard.style.willChange = 'auto';
    loginBrand.style.willChange = 'auto';
    loginTimeline = null;
  };

  if (typeof gsap === 'undefined') {
    loginCard.style.opacity = '0';
    loginCard.style.visibility = 'hidden';
    loginCard.style.transform = 'translateY(30px) scale(0.97)';
    loginBrand.style.transform = `translateY(${offset}px)`;
    finalizarCierre();
    return;
  }

  if (loginTimeline) loginTimeline.kill();
  gsap.killTweensOf([loginBrand, loginCard]);

  if (immediate || movimientoReducidoActivo()) {
    gsap.to(loginCard, {
      autoAlpha: 0,
      y: 30,
      scale: 0.97,
      duration: immediate ? 0 : 0.18,
      ease: 'power2.out',
      onComplete: () => {
        gsap.set(loginBrand, { y: offset, opacity: 1, scale: 1 });
        finalizarCierre();
      },
    });
    return;
  }

  loginTimeline = gsap.timeline({ onComplete: finalizarCierre });
  loginTimeline
    .to(loginCard, {
      autoAlpha: 0,
      y: 30,
      scale: 0.97,
      duration: 0.42,
      ease: 'power3.out',
    })
    .to(loginBrand, {
      y: offset,
      duration: 0.62,
      ease: 'power3.out',
    }, '-=0.18');
}

function alternarLogin() {
  if (loginRevelado) cerrarLogin();
  else revelarLogin();
}

function setLoginLoading(cargando) {
  loginSubmit.disabled = cargando;
  loginSubmit.setAttribute('aria-busy', String(cargando));
  loginSubmit.innerHTML = cargando
    ? '<span class="loading-spinner" aria-hidden="true"></span><span class="login-submit-label">Iniciando sesión…</span>'
    : '<span class="login-submit-label">Iniciar sesión</span><span class="material-symbols-outlined login-submit-arrow" aria-hidden="true">arrow_forward</span>';
}

loginBrand.addEventListener('click', alternarLogin);

loginBrand.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  alternarLogin();
});

passwordToggle.addEventListener('click', () => {
  const mostrar = loginPassword.type === 'password';
  loginPassword.type = mostrar ? 'text' : 'password';
  passwordToggle.setAttribute('aria-pressed', String(mostrar));
  passwordToggle.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
  passwordToggle.querySelector('.material-symbols-outlined').textContent = mostrar ? 'visibility_off' : 'visibility';
  loginPassword.focus({ preventScroll: true });
});

[loginEmail, loginPassword].forEach(input => {
  input.addEventListener('input', () => {
    if (loginError.textContent) loginError.textContent = '';
  });
});

window.addEventListener('resize', () => {
  if (loginRevelado) {
    if (typeof gsap !== 'undefined') {
      gsap.set(loginBrand, { y: 0 });
      gsap.set(loginCard, { y: 0, scale: 1 });
    }
    return;
  }
  posicionarLoginInicial();
});

function mostrarPantalla(id) {
  document.querySelectorAll('.pantalla.activa .sidebar.sidebar-expanded').forEach(sidebar => {
    actualizarNavegacion(sidebar, false, true);
  });
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  const pantalla = document.getElementById(id);
  pantalla.classList.add('activa');

  if (id === 'pantalla-login') prepararLogin();

  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.remove('nav-link-active');
    l.removeAttribute('aria-current');
  });
  const mapa = {
    'pantalla-paciente': 'nav-nueva',
    'pantalla-sintomas': 'nav-nueva',
    'pantalla-resultado': 'nav-nueva',
    'pantalla-historial': 'nav-historial',
    'pantalla-admin': 'nav-admin',
  };
  const activo = mapa[id];
  if (activo) {
    document.querySelectorAll(`.${activo}`).forEach(l => {
      l.classList.add('nav-link-active');
      l.setAttribute('aria-current', 'page');
    });
  }

  requestAnimationFrame(() => animarPantallaPremium(pantalla));
}

function animarPantallaPremium(pantalla) {
  if (typeof gsap === 'undefined' || !pantalla || pantalla.id === 'pantalla-login') return;

  const activadaPorTeclado = performance.now() - ultimaActivacionTeclado < 900;
  const reducirMovimiento = movimientoReducidoActivo() || activadaPorTeclado;
  const primeraEntrada = pantalla.dataset.entradaAnimada !== 'true';

  if (primeraEntrada) {
    const chrome = pantalla.querySelectorAll('.sidebar-brand, .nav-link, .topbar-location, .topbar-account');
    if (chrome.length) {
      gsap.fromTo(chrome,
        { opacity: 0, x: reducirMovimiento ? 0 : -6 },
        {
          opacity: 1,
          x: 0,
          duration: reducirMovimiento ? 0.16 : 0.24,
          ease: 'power2.out',
          stagger: reducirMovimiento ? 0 : 0.035,
          clearProps: 'transform,opacity',
        }
      );
    }
    pantalla.dataset.entradaAnimada = 'true';
  }

  const bloques = Array.from(pantalla.querySelectorAll('.shell-content > div > *'))
    .filter(elemento => getComputedStyle(elemento).display !== 'none');

  if (bloques.length) {
    gsap.killTweensOf(bloques);
    gsap.fromTo(bloques,
      { opacity: 0, y: reducirMovimiento ? 0 : 12 },
      {
        opacity: 1,
        y: 0,
        duration: reducirMovimiento ? 0.16 : 0.28,
        ease: 'power2.out',
        stagger: reducirMovimiento ? 0 : 0.035,
        clearProps: 'transform,opacity',
      }
    );
  }
}

function sidebarHTML(rol, contexto = 'app') {
  const esAdmin = rol === 'administrador';
  const esMedico = rol === 'medico';
  const adminLink = (esAdmin || esMedico)
    ? `<span class="nav-link nav-admin" id="nav-admin-link" role="button" tabindex="0" aria-label="${esAdmin ? 'Administración' : 'Equipo'}">
         <span class="nav-link-icon material-symbols-outlined" aria-hidden="true">${esAdmin ? 'admin_panel_settings' : 'groups'}</span>
         <span class="nav-link-label">${esAdmin ? 'Administración' : 'Equipo'}</span>
       </span>`
    : '';

  return `
    <div class="sidebar-brand">
      <img class="sidebar-brand-wordmark" src="assets/brand/saludxpert-wordmark.png" alt="SaludXpert" draggable="false">
      <button class="sidebar-brand-toggle" type="button" aria-expanded="false" aria-controls="sidebar-nav-${contexto}" aria-label="Abrir navegación">
        <img class="sidebar-brand-mark" src="assets/brand/saludxpert-mark.png" alt="" aria-hidden="true" draggable="false">
      </button>
    </div>
    <nav class="sidebar-nav flex-1 flex flex-col" id="sidebar-nav-${contexto}" aria-label="Navegación principal" aria-hidden="true">
      <span class="nav-link nav-nueva" id="nav-nueva-link" role="button" tabindex="0" aria-label="Nueva Consulta">
        <span class="nav-link-icon material-symbols-outlined" aria-hidden="true">add_circle</span>
        <span class="nav-link-label">Nueva consulta</span>
      </span>
      <span class="nav-link nav-historial" id="nav-historial-link" role="button" tabindex="0" aria-label="Historial">
        <span class="nav-link-icon material-symbols-outlined" aria-hidden="true">history</span>
        <span class="nav-link-label">Historial</span>
      </span>
      ${adminLink}
      <div class="theme-control">
        <span class="theme-control-label">Aspecto visual</span>
        <div class="theme-switcher" role="radiogroup" aria-label="Apariencia">
          <span class="theme-switch-indicator" aria-hidden="true"></span>
          <button class="theme-option" type="button" role="radio" data-theme-value="light" aria-label="Activar modo día" aria-checked="false">
            <span class="material-symbols-outlined" aria-hidden="true">light_mode</span>
          </button>
          <button class="theme-option" type="button" role="radio" data-theme-value="dark" aria-label="Activar modo noche" aria-checked="false">
            <span class="material-symbols-outlined" aria-hidden="true">dark_mode</span>
          </button>
        </div>
      </div>
    </nav>
  `;
}

function topbarHTML() {
  return `
    <span class="topbar-location">Centro de Salud Salcajá</span>
    <div class="topbar-account">
      <div class="topbar-user-copy">
        <p class="topbar-usuario-nombre"></p>
        <p class="topbar-usuario-rol"></p>
      </div>
      <span class="topbar-usuario-compacto"></span>
      <span class="topbar-avatar material-symbols-outlined" aria-hidden="true">person</span>
      <button class="btn-logout" title="Cerrar sesión" aria-label="Cerrar sesión">
        <span class="material-symbols-outlined" aria-hidden="true">logout</span>
      </button>
    </div>
  `;
}

function inyectarShell(rol) {
  iniciarControlInactividad();
  const pantallas = ['paciente', 'sintomas', 'resultado', 'historial', 'admin'];
  pantallas.forEach(p => {
    const sidebar = document.getElementById(`sidebar-${p}`);
    const topbar = document.getElementById(`topbar-${p}`);
    if (sidebar) sidebar.innerHTML = sidebarHTML(rol, p);
    if (topbar) topbar.innerHTML = topbarHTML();
  });
  registrarEventosShell();
  actualizarControlesTema();
  actualizarTopbarUsuario();
}

function activarConTeclado(el) {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      ultimaActivacionTeclado = performance.now();
      el.click();
    }
  });
}

function actualizarNavegacion(sidebar, abierta, instantanea = false) {
  if (!sidebar) return;

  const toggle = sidebar.querySelector('.sidebar-brand-toggle');
  const menu = sidebar.querySelector('.sidebar-nav');
  const wordmark = sidebar.querySelector('.sidebar-brand-wordmark');
  const rail = Number.parseFloat(getComputedStyle(sidebar).getPropertyValue('--sidebar-rail')) || 76;
  const posicionCerrada = -(sidebar.offsetWidth - rail);
  const altoMarca = sidebar.querySelector('.sidebar-brand')?.offsetHeight || 68;
  const recorteCerrado = Math.max(0, sidebar.scrollHeight - altoMarca);
  const radio = Number.parseFloat(getComputedStyle(sidebar).borderRadius) || 22;
  const clipAbierto = `inset(0px 0px 0px 0px round ${radio}px)`;
  const clipCerrado = `inset(0px 0px ${recorteCerrado}px 0px round ${radio}px)`;
  const reducirMovimiento = movimientoReducidoActivo();

  sidebar.classList.toggle('sidebar-expanded', abierta);
  toggle?.setAttribute('aria-expanded', String(abierta));
  toggle?.setAttribute('aria-label', abierta ? 'Cerrar navegación' : 'Abrir navegación');
  menu?.setAttribute('aria-hidden', String(!abierta));
  if (menu) menu.inert = !abierta;

  if (typeof gsap === 'undefined' || reducirMovimiento || instantanea) {
    if (typeof gsap !== 'undefined') {
      gsap.set(sidebar, { x: abierta ? 0 : posicionCerrada, clipPath: abierta ? clipAbierto : clipCerrado });
      gsap.set([menu, wordmark], { opacity: abierta ? 1 : 0, x: abierta ? 0 : -8 });
    } else {
      sidebar.style.transform = `translateX(${abierta ? 0 : posicionCerrada}px)`;
      sidebar.style.clipPath = abierta ? clipAbierto : clipCerrado;
      [menu, wordmark].forEach(elemento => {
        if (!elemento) return;
        elemento.style.opacity = abierta ? '1' : '0';
        elemento.style.transform = `translateX(${abierta ? 0 : -8}px)`;
      });
    }
    return;
  }

  gsap.killTweensOf([sidebar, menu, wordmark]);
  gsap.to(sidebar, {
    x: abierta ? 0 : posicionCerrada,
    clipPath: abierta ? clipAbierto : clipCerrado,
    duration: 0.26,
    ease: 'power3.out',
    overwrite: 'auto',
  });
  gsap.to([menu, wordmark], {
    opacity: abierta ? 1 : 0,
    x: abierta ? 0 : -8,
    duration: abierta ? 0.2 : 0.14,
    delay: abierta ? 0.04 : 0,
    ease: 'power2.out',
    overwrite: 'auto',
  });
}

function cerrarNavegacionActiva(instantanea = false) {
  document.querySelectorAll('.pantalla.activa .sidebar.sidebar-expanded').forEach(sidebar => {
    actualizarNavegacion(sidebar, false, instantanea);
  });
}

function cerrarNavegacionAlTocarFuera(evento) {
  const sidebar = document.querySelector('.pantalla.activa .sidebar.sidebar-expanded');
  if (sidebar && !sidebar.contains(evento.target)) actualizarNavegacion(sidebar, false);
}

function cerrarNavegacionConEscape(evento) {
  if (evento.key !== 'Escape') return;
  const sidebar = document.querySelector('.pantalla.activa .sidebar.sidebar-expanded');
  if (!sidebar) return;
  const toggle = sidebar.querySelector('.sidebar-brand-toggle');
  actualizarNavegacion(sidebar, false);
  toggle?.focus({ preventScroll: true });
}

window.addEventListener('resize', () => {
  requestAnimationFrame(() => {
    document.querySelectorAll('.pantalla.activa .sidebar:not(.sidebar-expanded)').forEach(sidebar => {
      actualizarNavegacion(sidebar, false, true);
    });
  });
});

function registrarEventosShell() {
  document.querySelectorAll('.sidebar-nav').forEach(menu => { menu.inert = true; });

  document.querySelectorAll('.sidebar-brand-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const sidebar = toggle.closest('.sidebar');
      actualizarNavegacion(sidebar, !sidebar.classList.contains('sidebar-expanded'));
    });
  });

  document.removeEventListener('pointerdown', cerrarNavegacionAlTocarFuera);
  document.addEventListener('pointerdown', cerrarNavegacionAlTocarFuera);
  document.removeEventListener('keydown', cerrarNavegacionConEscape);
  document.addEventListener('keydown', cerrarNavegacionConEscape);

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

  document.querySelectorAll('.theme-option').forEach(boton => {
    boton.addEventListener('click', () => aplicarTema(boton.dataset.themeValue));
    boton.addEventListener('keydown', evento => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(evento.key)) return;
      evento.preventDefault();
      const tema = evento.key === 'ArrowLeft' || evento.key === 'Home' ? 'light' : 'dark';
      aplicarTema(tema);
      boton.closest('.theme-switcher')?.querySelector(`[data-theme-value="${tema}"]`)?.focus();
    });
  });

  document.querySelectorAll('.btn-logout').forEach(btn =>
    btn.addEventListener('click', async () => {
      detenerControlInactividad();
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

function nombreConTitulo(u) {
  return u.titulo ? `${u.titulo} ${u.nombre}` : u.nombre;
}

function etiquetaRol(u) {
  if (u.rol === 'medico') {
    if (u.titulo === 'Dra.') return 'Médica';
    if (u.titulo === 'Dr.') return 'Médico';
    return 'Medicina';
  }
  if (u.rol === 'enfermeria') return 'Enfermería';
  if (u.rol === 'administrador') return 'Administración';
  return capitalizar(u.rol);
}

function nombreCompacto(u) {
  const primerNombre = (u.nombre || '').trim().split(/\s+/)[0];
  if (u.titulo) return `${u.titulo} ${primerNombre}`;
  if (u.rol === 'enfermeria') return `Enf. ${primerNombre}`;
  return primerNombre;
}

function actualizarTopbarUsuario() {
  const u = usuarioActual;
  document.querySelectorAll('.topbar-usuario-nombre').forEach(el => {
    el.textContent = u ? nombreConTitulo(u) : '';
  });
  document.querySelectorAll('.topbar-usuario-rol').forEach(el => {
    el.textContent = u ? etiquetaRol(u) : '';
  });
  document.querySelectorAll('.topbar-usuario-compacto').forEach(el => {
    el.textContent = u ? nombreCompacto(u) : '';
  });
}

async function cargarUsuarioActual() {
  usuarioActual = null;
  try {
    const data = await apiFetch('/api/usuarios/me');
    usuarioActual = {
      id: data.id,
      correo: data.correo,
      nombre: data.nombre,
      rol: data.rol,
      titulo: data.titulo || null,
      mfa_requerida: data.mfa_requerida === true,
    };
  } catch {
  }
  actualizarTopbarUsuario();
  return usuarioActual !== null;
}

async function entrarAlSistema() {
  if (usuarioActual.mfa_requerida) {
    await iniciarVerificacionMfa();
    return;
  }
  inyectarShell(usuarioActual.rol);
  irAPantallaPaciente();
}

let mfaFactorId = null;

// El administrador debe verificar su sesión con una app de autenticación (TOTP).
// Si todavía no tiene una configurada, se le muestra el QR para activarla.
async function iniciarVerificacionMfa() {
  const titulo = document.getElementById('mfa-titulo');
  const intro = document.getElementById('mfa-intro');
  const configuracion = document.getElementById('mfa-configuracion');
  document.getElementById('mensaje-error-mfa').textContent = '';
  document.getElementById('mfa-codigo').value = '';
  mfaFactorId = null;

  const { data: factores, error } = await supabaseClient.auth.mfa.listFactors();
  if (error) {
    await cerrarSesionForzada('No se pudo verificar tu cuenta. Inicia sesión de nuevo.');
    return;
  }

  const verificado = factores.totp.find(f => f.status === 'verified');
  if (verificado) {
    mfaFactorId = verificado.id;
    configuracion.hidden = true;
    titulo.textContent = 'Ingresa tu código';
    intro.textContent = 'Abre tu app de autenticación y escribe el código de 6 dígitos de SaludXpert.';
  } else {
    // Un intento anterior sin terminar deja un factor "unverified" que impide crear otro.
    for (const f of factores.all.filter(f => f.status === 'unverified')) {
      await supabaseClient.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data: nuevo, error: errorAlta } = await supabaseClient.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'SaludXpert',
    });
    if (errorAlta) {
      await cerrarSesionForzada('No se pudo activar la verificación en dos pasos. Intenta de nuevo.');
      return;
    }
    mfaFactorId = nuevo.id;
    document.getElementById('mfa-qr').src = nuevo.totp.qr_code;
    document.getElementById('mfa-secreto').textContent = nuevo.totp.secret;
    configuracion.hidden = false;
    titulo.textContent = 'Activa la verificación en dos pasos';
    intro.textContent = 'Tu cuenta de administrador necesita un segundo paso. Escanea el código con Google Authenticator o Microsoft Authenticator y escribe los 6 dígitos que aparecen.';
  }

  mostrarPantalla('pantalla-mfa');
  setTimeout(() => document.getElementById('mfa-codigo').focus(), 50);
}

document.getElementById('form-mfa').addEventListener('submit', async (e) => {
  e.preventDefault();
  const codigo = document.getElementById('mfa-codigo').value.trim();
  const mensajeError = document.getElementById('mensaje-error-mfa');
  mensajeError.textContent = '';

  if (!/^\d{6}$/.test(codigo)) {
    mensajeError.textContent = 'El código tiene 6 números.';
    return;
  }

  const boton = e.target.querySelector('button[type="submit"]');
  boton.disabled = true;
  const { error } = await supabaseClient.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: codigo });
  boton.disabled = false;
  if (error) {
    mensajeError.textContent = 'Código incorrecto o vencido. Escribe el código que aparece ahora en tu app.';
    return;
  }

  if (!(await cargarUsuarioActual())) {
    await cerrarSesionForzada('No se pudo cargar tu perfil. Inicia sesión de nuevo.');
    return;
  }
  await entrarAlSistema();
});

document.getElementById('mfa-cancelar').addEventListener('click', () => {
  cerrarSesionForzada('');
});

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
    await entrarAlSistema();
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

// Supabase puede exigir más que la lista de la app (se configura en su panel);
// error.reasons dice qué regla falló: 'length', 'characters' o 'pwned'.
function mensajeErrorContrasena(error) {
  if (error.code === 'same_password') return 'La nueva contraseña debe ser diferente a la anterior.';
  if (error.code !== 'weak_password') return 'No se pudo guardar la contraseña. Intenta de nuevo.';

  const motivos = error.reasons || [];
  const detalle = error.message || '';
  if (motivos.includes('pwned')) {
    return 'Esta contraseña aparece en filtraciones públicas y es fácil de adivinar. Elige una diferente.';
  }
  if (motivos.includes('length')) {
    const minimo = detalle.match(/at least (\d+)/)?.[1];
    return minimo
      ? `La contraseña debe tener al menos ${minimo} caracteres.`
      : 'La contraseña es demasiado corta. Usa una más larga.';
  }
  if (motivos.includes('characters')) {
    return /[!@#$%]/.test(detalle)
      ? 'La contraseña también debe incluir un símbolo, por ejemplo ! @ # $ %.'
      : 'La contraseña debe incluir mayúsculas, minúsculas y números.';
  }
  return 'La contraseña es muy débil. Prueba con una más larga y diferente.';
}

function evaluarContrasena(clave) {
  return {
    largo: clave.length >= 8,
    minuscula: /[a-z]/.test(clave),
    mayuscula: /[A-Z]/.test(clave),
    numero: /\d/.test(clave),
  };
}

document.getElementById('nueva-contrasena').addEventListener('input', (e) => {
  const cumple = evaluarContrasena(e.target.value);
  document.querySelectorAll('#requisitos-contrasena li').forEach(li => {
    li.classList.toggle('cumplido', cumple[li.dataset.req]);
  });
});

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
  if (!Object.values(evaluarContrasena(nueva)).every(Boolean)) {
    mensajeError.textContent = 'La contraseña no cumple todos los requisitos de la lista.';
    return;
  }

  const btnGuardar = e.target.querySelector('button[type="submit"]');
  btnGuardar.disabled = true;
  const { error } = await supabaseClient.auth.updateUser({ password: nueva });
  btnGuardar.disabled = false;
  if (error) {
    mensajeError.textContent = mensajeErrorContrasena(error);
    return;
  }

  if (!(await cargarUsuarioActual())) {
    await mostrarAlerta('Cuenta no disponible', document.getElementById('mensaje-error').textContent || 'No se pudo cargar tu perfil.');
    return;
  }
  await entrarAlSistema();
});

(async function iniciarApp() {
  prepararLogin();
  // Despierta la API de Render mientras la persona escribe sus credenciales.
  fetch(`${API_URL}/`).catch(() => {});

  const manejadoPorEnlaceEspecial = await manejarEnlaceEspecial();
  if (manejadoPorEnlaceEspecial) return;

  const ultima = leerActividadGuardada();
  const { data } = await supabaseClient.auth.getSession();
  if (data?.session && ultima && Date.now() - ultima > INACTIVIDAD_LIMITE_MS) {
    await cerrarSesionForzada('Tu sesión se cerró por inactividad. Inicia sesión de nuevo.');
    return;
  }
  await restaurarSesion();
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();

  const correo = document.getElementById('correo').value;
  const contrasena = document.getElementById('contrasena').value;
  const mensajeError = document.getElementById('mensaje-error');
  mensajeError.textContent = '';
  setLoginLoading(true);

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
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
    await entrarAlSistema();
  } catch {
    mensajeError.textContent = 'No se pudo iniciar sesión. Revisa tu conexión e intenta de nuevo.';
  } finally {
    setLoginLoading(false);
  }
});

document.getElementById('link-recuperar').addEventListener('click', async () => {
  const correo = await mostrarPrompt('Recuperar contraseña', 'tu@correo.com');
  if (!correo) return;

  const { error } = await supabaseClient.auth.resetPasswordForEmail(correo, {
    redirectTo: `${window.location.origin}/`,
  });
  if (error?.status === 429 || error?.code === 'over_email_send_rate_limit') {
    await mostrarAlerta('Espera unos minutos', 'Se pidieron demasiados correos de recuperación. Intenta de nuevo más tarde.');
  } else if (error) {
    await mostrarAlerta('Error', 'No se pudo enviar el correo de recuperación. Revisa que el correo esté bien escrito.');
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
  document.querySelector('#btn-guardar-paciente .shiny-cta-content').textContent = 'Guardar cambios y continuar';
  document.getElementById('btn-cancelar-edicion-paciente').style.display = '';

  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function salirModoEdicionPaciente() {
  const form = document.getElementById('form-nuevo-paciente');
  form.dataset.editandoId = '';
  form.reset();

  document.getElementById('texto-form-paciente').textContent = 'o registre uno nuevo';
  document.querySelector('#btn-guardar-paciente .shiny-cta-content').textContent = 'Registrar y continuar';
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

    const categorias = {};
    ['peligro', 'respiratorio', 'gastrointestinal', 'urinario', 'oido', 'piel', 'general'].forEach(c => {
      categorias[c] = document.getElementById(`cat-${c}`);
      categorias[c].innerHTML = '';
    });

    listaSintomas.forEach(sintoma => {
      const btn = document.createElement('button');
      btn.className = 'btn-sintoma';
      if (sintoma.nivel_alerta) btn.classList.add(`btn-sintoma-${sintoma.nivel_alerta}`);
      btn.textContent = sintoma.nombre;
      btn.dataset.nombre = sintoma.nombre;
      if (sintomasSeleccionados.includes(sintoma.nombre)) btn.classList.add('seleccionado');
      btn.addEventListener('click', () => toggleSintoma(btn, sintoma.nombre));

      (categorias[sintoma.categoria] || categorias.general).appendChild(btn);
    });

    Object.values(categorias).forEach(c => {
      c.closest('.bg-surface-container-lowest').style.display = c.children.length ? '' : 'none';
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
  btn.innerHTML = `<span class="shiny-cta-content"><span class="loading-spinner"></span><span>Analizando...</span></span>`;

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
    btn.innerHTML = `<span class="shiny-cta-content">Analizar Síntomas <span class="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span></span>`;
  }
});

function renderAlertaPeligro(sintomas) {
  const alerta = document.getElementById('alerta-peligro');
  const conAlerta = listaSintomas.filter(s => s.nivel_alerta && sintomas.includes(s.nombre));
  const referir = conAlerta.filter(s => s.nivel_alerta === 'referir');
  const inmediata = conAlerta.filter(s => s.nivel_alerta === 'atencion_inmediata');

  if (!conAlerta.length) {
    alerta.hidden = true;
    alerta.innerHTML = '';
    return;
  }

  const lista = items => items.map(s => `<li>${escaparHtml(s.nombre)}</li>`).join('');
  alerta.classList.toggle('alerta-peligro-referir', referir.length > 0);
  alerta.innerHTML = referir.length
    ? `<span class="material-symbols-outlined" aria-hidden="true">emergency</span>
       <div>
         <strong>Signos de peligro: estabilizar y referir de urgencia al hospital más cercano.</strong>
         <ul>${lista(referir)}${lista(inmediata)}</ul>
         <small>Normas de Atención Integral MSPAS 2025, Cuadro No. 1.</small>
         <button type="button" class="btn-imprimir-referencia" id="btn-imprimir-referencia">
           <span class="material-symbols-outlined" aria-hidden="true">print</span>
           Imprimir hoja de referencia
         </button>
       </div>`
    : `<span class="material-symbols-outlined" aria-hidden="true">priority_high</span>
       <div>
         <strong>Requiere atención inmediata en el servicio de salud.</strong>
         <ul>${lista(inmediata)}</ul>
         <small>Normas de Atención Integral MSPAS 2025, Cuadro No. 1.</small>
       </div>`;
  alerta.hidden = false;
}

function edadDesde(fechaNacimiento) {
  if (!fechaNacimiento) return '';
  const nacimiento = new Date(`${fechaNacimiento}T00:00:00`);
  const hoy = new Date();
  let meses = (hoy.getFullYear() - nacimiento.getFullYear()) * 12 + (hoy.getMonth() - nacimiento.getMonth());
  if (hoy.getDate() < nacimiento.getDate()) meses--;
  if (meses < 12) return `${Math.max(meses, 0)} ${meses === 1 ? 'mes' : 'meses'}`;
  const anios = Math.floor(meses / 12);
  return `${anios} ${anios === 1 ? 'año' : 'años'}`;
}

function imprimirHojaReferencia() {
  const hoja = document.getElementById('hoja-referencia');
  const sintomas = ultimoResultado?.sintomas_ingresados || sintomasSeleccionados;
  const porNombre = Object.fromEntries(listaSintomas.map(s => [s.nombre, s]));
  const peligro = sintomas.filter(n => porNombre[n]?.nivel_alerta);
  const otros = sintomas.filter(n => !porNombre[n]?.nivel_alerta);
  const diagnosticos = (ultimoResultado?.diagnosticos || []).slice(0, 3);
  const p = pacienteActual || {};
  const fecha = new Date().toLocaleString('es-GT', {
    timeZone: 'America/Guatemala', dateStyle: 'long', timeStyle: 'short',
  });
  const dato = (etiqueta, valor) => `<div class="hr-dato"><span>${etiqueta}</span><strong>${escaparHtml(valor || '—')}</strong></div>`;
  const lista = items => items.length
    ? `<ul>${items.map(i => `<li>${escaparHtml(i)}</li>`).join('')}</ul>`
    : '<p>—</p>';
  const linea = etiqueta => `<div class="hr-linea"><span>${etiqueta}</span><i></i></div>`;

  hoja.innerHTML = `
    <header class="hr-encabezado">
      <div>
        <h1>Hoja de referencia</h1>
        <p>Centro de Salud de Salcajá · ${escaparHtml(fecha)}</p>
      </div>
      <img src="assets/brand/saludxpert-mark.png" alt="">
    </header>

    <h2>Datos del paciente</h2>
    <div class="hr-grid">
      ${dato('Nombre', p.nombre)}
      ${dato('CUI / DPI', p.documento)}
      ${dato('Fecha de nacimiento', p.fecha_nacimiento ? `${p.fecha_nacimiento} (${edadDesde(p.fecha_nacimiento)})` : '')}
      ${dato('Alergias', p.alergias)}
      ${dato('Condiciones crónicas', p.condiciones_cronicas)}
      ${dato('Medicamentos actuales', p.medicamentos_actuales)}
    </div>

    <h2>Motivo de referencia: signos de peligro</h2>
    <p class="hr-nota">Normas de Atención Integral MSPAS 2025, Cuadro No. 1: estabilizar y referir de urgencia.</p>
    ${lista(peligro)}

    <h2>Otros síntomas registrados</h2>
    ${lista(otros)}

    <h2>Diagnóstico presuntivo (apoyo al criterio médico)</h2>
    ${lista(diagnosticos.map(d => `${d.enfermedad} (${d.confianza} %)`))}

    <h2>Signos vitales y manejo</h2>
    <div class="hr-vitales">
      ${linea('Temperatura')}${linea('Frec. cardiaca')}${linea('Frec. respiratoria')}
      ${linea('Saturación O₂')}${linea('Peso')}${linea('Presión arterial')}
    </div>
    ${linea('Tratamiento o estabilización administrada')}
    ${linea('')}
    ${linea('Hospital o servicio de destino')}

    <div class="hr-firmas">
      <div><i></i><span>${escaparHtml(usuarioActual ? nombreConTitulo(usuarioActual) : '')}</span><small>${escaparHtml(usuarioActual ? etiquetaRol(usuarioActual) : '')} · refiere</small></div>
      <div><i></i><span>Firma y sello</span></div>
    </div>

    <footer class="hr-pie">Documento de apoyo generado por SaludXpert. No sustituye la boleta oficial de referencia y contrarreferencia del MSPAS.</footer>
  `;

  document.body.classList.add('imprimiendo-referencia');
  window.addEventListener('afterprint', () => document.body.classList.remove('imprimiendo-referencia'), { once: true });
  window.print();
}

document.getElementById('alerta-peligro').addEventListener('click', e => {
  if (e.target.closest('#btn-imprimir-referencia')) imprimirHojaReferencia();
});

function mostrarResultado(resultado) {
  renderBannerPaciente('banner-paciente-resultado');
  renderAlertaPeligro(resultado.sintomas_ingresados || sintomasSeleccionados);

  const diagnosticos = resultado.diagnosticos || [];
  const principal = diagnosticos[0];

  const banner = document.getElementById('banner-advertencia');
  banner.style.display = resultado.confianza_suficiente || !principal ? 'none' : 'block';

  const puedeDecidir = ['medico', 'administrador'].includes(usuarioActual?.rol);
  document.getElementById('btn-confirmar').style.display = puedeDecidir && principal ? '' : 'none';
  document.getElementById('btn-descartar').style.display = puedeDecidir ? '' : 'none';

  if (!principal) {
    document.getElementById('resultado-principal').innerHTML = `
      <div class="nombre-enfermedad">Sin coincidencias</div>
      <p class="text-body-md text-on-surface-variant">Los síntomas seleccionados no corresponden a ninguna enfermedad de la base de conocimiento. Se requiere evaluación clínica.</p>
    `;
    document.getElementById('resultados-alternativos').innerHTML = '';
    return;
  }

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

  const barraConfianza = document.querySelector('.barra-confianza-fill');
  if (barraConfianza && typeof gsap !== 'undefined' && !movimientoReducidoActivo()) {
    gsap.fromTo(barraConfianza,
      { scaleX: 0, transformOrigin: 'left center' },
      {
        scaleX: 1,
        duration: 0.7,
        ease: 'power3.out',
        clearProps: 'transform',
      }
    );
  }

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

  const rolEscrito = await mostrarPrompt('Rol', 'medico / enfermeria');
  const rol = (rolEscrito || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!['medico', 'enfermeria'].includes(rol)) {
    await mostrarAlerta('Rol inválido', 'Debe ser: medico o enfermeria.');
    return;
  }

  let titulo = null;
  if (rol === 'medico') {
    const tituloEscrito = await mostrarPrompt('Título (Dr. o Dra.)', 'Dr. / Dra.');
    const normalizado = (tituloEscrito || '').trim().toLowerCase().replace(/\.$/, '');
    titulo = { dr: 'Dr.', doctor: 'Dr.', dra: 'Dra.', doctora: 'Dra.' }[normalizado] || null;
    if (!titulo) {
      await mostrarAlerta('Título inválido', 'Escribe Dr. o Dra.');
      return;
    }
  }

  try {
    await apiFetch('/api/usuarios', {
      method: 'POST',
      body: JSON.stringify({ nombre, correo, rol, titulo }),
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
      const esUnoMismo = u.id === usuarioActual?.id;
      const accionTd = esAdmin
        ? `<td class="celda-acciones" data-label="Acción">
            <div class="acciones-usuario">
              <button class="btn-toggle ${u.activo ? 'desactivar' : 'activar'}" data-id="${u.id}" data-activo="${u.activo}">
                ${u.activo ? 'Desactivar' : 'Activar'}
              </button>
              ${esUnoMismo || !u.activo ? '' : `<button class="btn-icono-usuario btn-reenviar-enlace" data-id="${u.id}" data-correo="${escaparHtml(u.correo)}" aria-label="Reenviar enlace para crear contraseña a ${escaparHtml(u.nombre)}" title="Reenviar enlace para crear contraseña">
                <span class="material-symbols-outlined" aria-hidden="true">forward_to_inbox</span>
              </button>`}
              ${esUnoMismo ? '' : `<button class="btn-eliminar-usuario" data-id="${u.id}" data-nombre="${escaparHtml(u.nombre)}" aria-label="Eliminar a ${escaparHtml(u.nombre)}" title="Eliminar usuario">
                <span class="material-symbols-outlined" aria-hidden="true">delete</span>
              </button>`}
            </div>
          </td>`
        : '';
      const selectorTitulo = esAdmin && u.rol === 'medico'
        ? `<select class="select-titulo" data-id="${u.id}" aria-label="Título de ${escaparHtml(u.nombre)}">
            <option value="" ${u.titulo ? '' : 'selected'}>Título</option>
            <option value="Dr." ${u.titulo === 'Dr.' ? 'selected' : ''}>Dr.</option>
            <option value="Dra." ${u.titulo === 'Dra.' ? 'selected' : ''}>Dra.</option>
          </select>`
        : '';
      tr.innerHTML = `
        <td class="celda-nombre" data-label="Nombre">${escaparHtml(nombreConTitulo(u))}</td>
        <td class="celda-correo" data-label="Correo">${escaparHtml(u.correo)}</td>
        <td data-label="Rol"><div class="celda-rol"><span class="rol-badge rol-${u.rol}">${escaparHtml(etiquetaRol(u))}</span>${selectorTitulo}</div></td>
        <td data-label="Estado">${u.activo ? 'Activo' : 'Inactivo'}</td>
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

      tbody.querySelectorAll('.select-titulo').forEach(select => {
        select.addEventListener('change', async () => {
          try {
            await apiFetch(`/api/usuarios/${select.dataset.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ titulo: select.value || null }),
            });
            await cargarPanelAdmin();
          } catch (error) {
            await mostrarAlerta('Error', error.message || 'No se pudo guardar el título.');
          }
        });
      });

      tbody.querySelectorAll('.btn-reenviar-enlace').forEach(btn => {
        btn.addEventListener('click', async () => {
          const confirmado = await mostrarConfirmacion(
            'Reenviar enlace',
            `Se enviará a ${btn.dataset.correo} un correo con un enlace nuevo para crear su contraseña.`,
            'Enviar'
          );
          if (!confirmado) return;
          btn.disabled = true;
          try {
            await apiFetch(`/api/usuarios/${btn.dataset.id}/reenviar-enlace`, { method: 'POST' });
            await mostrarAlerta('Enlace enviado', `Se envió el correo a ${btn.dataset.correo}. El enlace sirve una sola vez.`);
          } catch (error) {
            await mostrarAlerta('No se pudo enviar', error.message || 'No se pudo enviar el enlace.');
          } finally {
            btn.disabled = false;
          }
        });
      });

      tbody.querySelectorAll('.btn-eliminar-usuario').forEach(btn => {
        btn.addEventListener('click', async () => {
          const confirmado = await mostrarConfirmacion(
            'Eliminar usuario',
            `¿Eliminar a ${btn.dataset.nombre}? Sus consultas y pacientes registrados se conservan. Esta acción no se puede deshacer.`,
            'Eliminar'
          );
          if (!confirmado) return;
          try {
            await apiFetch(`/api/usuarios/${btn.dataset.id}`, { method: 'DELETE' });
            await cargarPanelAdmin();
          } catch (error) {
            await mostrarAlerta('No se pudo eliminar', error.message || 'No se pudo eliminar el usuario.');
          }
        });
      });
    }

  } catch (error) {
    console.error('Error cargando panel admin:', error);
  }
}
