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
  await supabaseClient.auth.signOut();
  usuarioActual = null;
  mostrarPantalla('pantalla-login');
  document.getElementById('mensaje-error').textContent = mensaje;
  revelarLogin({ focus: false, immediate: true });
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
      <span class="topbar-avatar material-symbols-outlined" aria-hidden="true">person</span>
      <div class="topbar-user-copy text-right">
        <p class="text-label-md font-label-md text-on-surface leading-none topbar-usuario-nombre"></p>
        <p class="text-xs text-on-secondary-container topbar-usuario-rol"></p>
      </div>
      <span class="topbar-usuario-compacto"></span>
      <button class="btn-logout" title="Cerrar sesión" aria-label="Cerrar sesión">
        <span class="material-symbols-outlined" aria-hidden="true">logout</span>
      </button>
    </div>
  `;
}

function inyectarShell(rol) {
  const pantallas = ['paciente', 'sintomas', 'resultado', 'historial', 'admin'];
  pantallas.forEach(p => {
    const sidebar = document.getElementById(`sidebar-${p}`);
    const topbar = document.getElementById(`topbar-${p}`);
    if (sidebar) sidebar.innerHTML = sidebarHTML(rol, p);
    if (topbar) topbar.innerHTML = topbarHTML();
  });
  registrarEventosShell();
  actualizarControlesTema();
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
  const rolesCompactos = {
    administrador: 'Admin',
    medico: 'Dr',
    enfermeria: 'ENF',
  };
  const rolCompacto = usuarioActual
    ? (rolesCompactos[usuarioActual.rol] || capitalizar(usuarioActual.rol))
    : '';
  document.querySelectorAll('.topbar-usuario-compacto').forEach(el => {
    el.textContent = rolCompacto;
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

  const { error } = await supabaseClient.auth.updateUser({ password: nueva });
  if (error) {
    mensajeError.textContent = error.code === 'weak_password'
      ? 'La contraseña es muy débil. Usa 8 o más caracteres, con mayúsculas, minúsculas y números.'
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
  prepararLogin();

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
    inyectarShell(usuarioActual.rol);
    irAPantallaPaciente();
  } catch {
    mensajeError.textContent = 'No se pudo iniciar sesión. Revisa tu conexión e intenta de nuevo.';
  } finally {
    setLoginLoading(false);
  }
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
