# SaludXpert

Sistema de apoyo al diagnóstico clínico para el Centro de Salud de Salcajá.
El personal de enfermería registra los síntomas de un paciente, una red
bayesiana sugiere posibles enfermedades con un nivel de confianza, y un
médico confirma o descarta la sugerencia dejando el diagnóstico definitivo
registrado.

## Arquitectura

Cuatro componentes independientes, cada uno con su propio `package.json` /
`requirements.txt`:

```
frontend/            HTML + CSS + JS vanilla (PWA) — UI clínica
api-backend/          Node + Express — API pública, auth y autorización por rol
motor-inferencia/     Python + Flask + pgmpy — red bayesiana de diagnóstico
pruebas-validacion/   Cucumber (Gherkin en español) — pruebas de aceptación end-to-end
supabase/migrations/  Historial de cambios de esquema, aplicados a mano en Supabase
```

Flujo de una consulta:

```
frontend  →  api-backend (valida JWT de Supabase Auth + rol)
                 │
                 ├─→ motor-inferencia (Flask, protegido por X-Internal-Secret)
                 │       → calcula probabilidades con la red bayesiana
                 │
                 └─→ Supabase (guarda la consulta, historial, pacientes)
```

- **Auth**: Supabase Auth (JWT). El frontend nunca habla con `motor-inferencia`
  directamente — todo pasa por `api-backend`.
- **Autorización**: roles `enfermeria` / `medico` / `administrador`, aplicados
  en middlewares de Express (`requireAuth`, `requireMedicoOAdmin`, `requireAdmin`).
- **Base de datos**: Supabase (Postgres) con RLS *deny-by-default* — el único
  acceso previsto a las tablas es vía `service_role` desde `api-backend`.
  Ver [`supabase/migrations/`](supabase/migrations/) para el detalle.
- **`motor-inferencia`** nunca se expone directamente a internet sin control:
  arranca y falla (`raise RuntimeError`) si no tiene `INTERNAL_SECRET`
  configurado, y solo responde a peticiones que traigan ese secreto en el
  header `X-Internal-Secret` (lo agrega `api-backend` en cada llamada).
- **Monitoreo**: ambos servicios inicializan Sentry (`SENTRY_DSN`) — si no
  está configurado, el SDK queda inactivo sin afectar nada. En
  `api-backend`, cada `catch` que hoy hace `console.error` también manda el
  error a Sentry con `Sentry.captureException`.
- **Rate limiting**: `api-backend` limita las rutas `/api/*` a 1000 requests
  por IP cada 15 minutos (`RATE_LIMIT_MAX`), usando `req.ip` detrás del
  proxy de Render (`app.set('trust proxy', 1)`). El límite es alto a propósito:
  todo el personal del centro de salud sale por la misma IP pública.
- **Cuentas**: un JWT válido no basta. `requireAuth` exige además una fila
  con `activo = true` en `usuarios`; desactivar a alguien corta su acceso a la
  API de inmediato. En Supabase debe estar desactivado el auto-registro
  (Authentication → Sign In / Providers → *Allow new users to sign up*), las
  cuentas se crean solo por invitación desde el panel de administración.

## Requisitos

- Node 22+ (usa `node:test`, incluido desde Node 18)
- Python 3.11 (ver `motor-inferencia/runtime.txt`)
- Un proyecto de Supabase con el esquema aplicado (ver
  [`supabase/migrations/README.md`](supabase/migrations/README.md))

## Levantar el proyecto en local

Cada servicio tiene su propio `.env` (no versionado — pide las credenciales
reales a quien administre el proyecto en Supabase/Render).

### 1. `motor-inferencia` (puerto 5000)

```bash
cd motor-inferencia
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt          # solo lo necesario para correr el servicio
# pip install -r requirements-dev.txt    # además, si vas a correr los tests (pytest/selenium)
cp .env.example .env   # completa SUPABASE_URL, SUPABASE_KEY, INTERNAL_SECRET
python app.py
```

### 2. `api-backend` (puerto 3000)

```bash
cd api-backend
npm install
cp .env.example .env   # completa SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY,
                        # MOTOR_URL, INTERNAL_SECRET (debe coincidir con el de arriba),
                        # ALLOWED_ORIGIN
node index.js
```

### 3. `frontend`

Servir el directorio como archivos estáticos (por ejemplo con la extensión
Live Server de VS Code en `http://127.0.0.1:5500`, que es el origen por
defecto que acepta `api-backend`). Actualiza `API_URL` en
[`frontend/script.js`](frontend/script.js) si tu backend no corre en
`http://localhost:3000`.

## Variables de entorno

| Servicio | Variable | Descripción |
|---|---|---|
| `motor-inferencia` | `SUPABASE_URL`, `SUPABASE_KEY` | Lectura de enfermedades/síntomas/relaciones |
| `motor-inferencia` | `INTERNAL_SECRET` | Debe coincidir con el de `api-backend`; requerido para arrancar |
| `motor-inferencia` | `ALLOWED_ORIGINS` | Orígenes permitidos por CORS (en la práctica, solo `api-backend` debería llamarlo) |
| `motor-inferencia` | `PORT` | Puerto (default 5000) |
| `motor-inferencia` | `TEST_EMAIL`, `TEST_PASSWORD` | Cuenta de prueba usada por `test_sistema_selenium.py` |
| `api-backend` | `SUPABASE_URL`, `SUPABASE_KEY` | Cliente anónimo |
| `api-backend` | `SUPABASE_SERVICE_KEY` | Cliente admin (`service_role`) — bypassa RLS, solo vive en el backend |
| `api-backend` | `MOTOR_URL` | URL del motor de inferencia (local o producción) |
| `api-backend` | `INTERNAL_SECRET` | Secreto compartido con `motor-inferencia` |
| `api-backend` | `ALLOWED_ORIGIN` | Orígenes permitidos por CORS, separados por coma |
| `api-backend` | `PORT` | Puerto (default 3000) |
| `api-backend` | `SENTRY_DSN` | Opcional — reporte de errores en producción. Sin esto el servidor funciona igual, solo que los errores no se reportan a ningún lado |
| `api-backend` | `RATE_LIMIT_MAX` | Opcional — requests por IP cada 15 min en rutas `/api` (default 1000) |
| `motor-inferencia` | `SENTRY_DSN` | Opcional — mismo comportamiento que en `api-backend` |
| `pruebas-validacion` | `TEST_API_URL` | API contra la que corren los escenarios BDD |
| `pruebas-validacion` | `TEST_EMAIL`, `TEST_PASSWORD` | Credenciales de un usuario de prueba real en Supabase Auth |
| `pruebas-validacion` | `SUPABASE_URL`, `SUPABASE_KEY` | Para autenticar al usuario de prueba |

## Tests

| Servicio | Comando | Qué cubre | ¿Necesita credenciales reales? |
|---|---|---|---|
| `api-backend` | `cd api-backend && npm test` | Autenticación (401 sin token), autorización por rol (`requireAdmin`/`requireMedicoOAdmin`), validación de datos de paciente, y las rutas de pacientes/consultas/diagnóstico usando un doble de prueba de Supabase (`test/helpers/supabaseStub.js`) | No — usa valores dummy |
| `motor-inferencia` | `cd motor-inferencia && source venv/bin/activate && pytest test_motor.py` | Lógica de la red bayesiana (`calcular_diagnostico`) | **Sí** — consulta enfermedades/síntomas reales vía Supabase, no está mockeado |
| `motor-inferencia` | `pytest test_sistema_selenium.py` | UI end-to-end con Chrome real (login, paciente, síntomas, diagnóstico) | **Sí** — requiere `frontend` servido en `127.0.0.1:5500`, `api-backend` y `motor-inferencia` corriendo, y Chrome instalado |
| `pruebas-validacion` | `cd pruebas-validacion && npx cucumber-js` | Flujo end-to-end contra una API desplegada | **Sí** — API en vivo + usuario de prueba en Supabase Auth |

`npm test` en `api-backend` es el único que corre en CI (ver
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)) sin configuración
adicional. El pytest de `motor-inferencia` está en el pipeline pero se omite
a menos que el repo tenga la variable de Actions `SUPABASE_TESTS_ENABLED`
en `true` y los secretos `SUPABASE_URL`/`SUPABASE_KEY` configurados — no es
un test unitario aislado, así que correrlo en CI implica apuntar a un
proyecto de Supabase real (idealmente uno de prueba, no producción).

## Despliegue

- `frontend`: estático en Vercel (`https://salud-xpert.vercel.app`); ese
  origen debe estar en `ALLOWED_ORIGIN` de `api-backend`. Los headers de
  seguridad están en [`frontend/vercel.json`](frontend/vercel.json).
- `api-backend` y `motor-inferencia`: Render (`motor-inferencia/runtime.txt`
  fija la versión de Python; `gunicorn` está en sus dependencias para
  producción).

## Migraciones de base de datos

No hay migrador automático. Los cambios de esquema se aplican a mano en el
SQL Editor de Supabase y quedan documentados como archivos numerados en
[`supabase/migrations/`](supabase/migrations/) — ese directorio explica el
orden, qué hace cada uno y cómo verificar qué está aplicado.

## Respaldos

Supabase Free no incluye respaldos automáticos. Para exportar todas las
tablas a JSON (requiere `SUPABASE_SERVICE_KEY` en `api-backend/.env`):

```bash
cd api-backend && npm run respaldo
```

Se guarda en `respaldos/<fecha>/` (ignorado por git). Contiene datos
clínicos: guárdalo cifrado y fuera del repositorio.
