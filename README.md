# SaludXpert

Sistema de apoyo al diagnóstico para el Centro de Salud de Salcajá. Enfermería registra los síntomas, una red bayesiana sugiere enfermedades y un médico confirma o descarta.

## Estructura

```
frontend/             HTML, CSS y JS (PWA)
tools/tailwind/       Compila frontend/tailwind.css
api-backend/          Node + Express: API, sesión y roles
motor-inferencia/     Python + Flask + pgmpy: red bayesiana
pruebas-validacion/   Pruebas de aceptación (Cucumber)
supabase/             Migraciones y plantillas de correo
```

```
frontend → api-backend → motor-inferencia
                ↓
             Supabase
```

- **Sesión:** Supabase Auth. Además del token, se exige una fila activa en `usuarios`; el administrador necesita verificación en dos pasos.
- **Roles:** `enfermeria`, `medico` y `administrador` (uno solo).
- **Base de datos:** RLS sin políticas; solo `api-backend` accede con `service_role`.
- **Motor:** solo responde con el header `X-Internal-Secret`.
- **Auto-registro:** desactivado en Supabase; las cuentas se crean por invitación.

## Requisitos

- Node 22+
- Python 3.11
- Proyecto de Supabase con las [migraciones](supabase/migrations/README.md) aplicadas

## En local

```bash
# motor-inferencia (puerto 5000)
cd motor-inferencia
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python app.py

# api-backend (puerto 3000)
cd api-backend
npm install
cp .env.example .env
node index.js

# CSS (después de cambiar clases de Tailwind)
cd tools/tailwind && npm install && npm run css
```

Sirve `frontend/` como archivos estáticos (Live Server en `http://127.0.0.1:5500`) y cambia `API_URL` en `frontend/script.js` si el backend corre en local.

## Variables de entorno

| Servicio | Variable | Uso |
|---|---|---|
| motor | `SUPABASE_URL`, `SUPABASE_KEY` | Leer la base de conocimiento |
| motor | `INTERNAL_SECRET` | Obligatoria; igual a la de la API |
| motor | `ALLOWED_ORIGINS`, `PORT`, `SENTRY_DSN` | Opcionales |
| api | `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY` | Clientes de Supabase |
| api | `MOTOR_URL`, `INTERNAL_SECRET` | Conexión con el motor |
| api | `ALLOWED_ORIGIN` | Orígenes permitidos, separados por coma |
| api | `PORT`, `SENTRY_DSN`, `RATE_LIMIT_MAX` | Opcionales |
| pruebas | `TEST_API_URL`, `TEST_EMAIL`, `TEST_PASSWORD`, `SUPABASE_URL`, `SUPABASE_KEY` | Pruebas contra una API real |

## Pruebas

| Comando | Qué prueba | Credenciales |
|---|---|---|
| `cd api-backend && npm test` | Rutas, roles y validaciones (con un doble de Supabase) | No |
| `cd motor-inferencia && pytest test_motor.py` | Red bayesiana | Sí |
| `pytest test_sistema_selenium.py` | Interfaz completa con Chrome | Sí |
| `cd pruebas-validacion && npx cucumber-js` | Flujo contra la API desplegada | Sí |

En CI corren las pruebas de la API y la verificación de `tailwind.css`.

## Despliegue

- `frontend`: Vercel (`https://salud-xpert.vercel.app`), se publica al hacer push a `main`. Cabeceras de seguridad en `frontend/vercel.json`.
- `api-backend` y `motor-inferencia`: Render, despliegue manual.
- Migraciones: a mano en el SQL Editor de Supabase, antes de desplegar el backend que las usa.

## Respaldos

Supabase Free no hace respaldos automáticos. Desde `api-backend` (requiere `SUPABASE_SERVICE_KEY`):

```bash
npm run respaldo:cifrado                          # archivo .sxbk cifrado (recomendado)
npm run respaldo                                  # JSON sin cifrar
npm run descifrar -- ../respaldos/<archivo>.sxbk
```

Guarda la contraseña del respaldo en un gestor de contraseñas y copia los archivos a un disco externo: contienen datos clínicos.
