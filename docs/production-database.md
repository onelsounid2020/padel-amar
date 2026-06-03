# Base de datos de produccion

## Objetivo

Produccion debe usar PostgreSQL persistente en Railway. No usar `sqlite:///./padel_manager.db` como base productiva.

## Estado actual seguro

- `backend/padel_manager.db` no debe sincronizarse con Git.
- En este workspace esta marcado como `skip-worktree`.
- `.gitignore` ignora archivos `.db` y backups derivados.
- El backend expone `GET /health/db` para confirmar el motor conectado.

## Variables esperadas

Backend Railway:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
FRONTEND_URL=https://padel-amar-production.up.railway.app
TABLET_ACCESS_TOKEN=<token-largo>
AUTH_SECRET=<token-largo-distinto>
```

`AUTH_SECRET` debe ser estable y distinto de `TABLET_ACCESS_TOKEN`; si cambia, las sesiones activas expiran.
El backend aplica un rate limit en memoria para `/auth/login` y `/auth/tablet-login`; si aparece HTTP 429, esperar unos minutos o revisar intentos automatizados.

## Migracion SQLite a PostgreSQL

No ejecutar sobre produccion sin backup descargado.

1. Crear un servicio PostgreSQL en Railway.
2. Copiar el `DATABASE_URL` del servicio Postgres.
3. Descargar la SQLite productiva actual.
4. Probar la migracion contra Postgres vacio.

Ejemplo local:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export SOURCE_DATABASE_URL="sqlite:////ruta/absoluta/padel_manager.db"
export TARGET_DATABASE_URL="postgresql://..."
python scripts/migrate_sqlite_to_postgres.py
```

El script se niega a copiar si el destino ya tiene datos. Solo usar `ALLOW_NONEMPTY_TARGET=1` despues de verificar manualmente que es seguro.

## Validacion despues del cambio

Con el backend apuntando a Postgres:

```bash
curl https://radiant-warmth-production-a8ec.up.railway.app/health/db
curl https://radiant-warmth-production-a8ec.up.railway.app/events/dashboard
```

Checklist visual:

- Eventos visibles.
- Usuarios visibles.
- Inscritos por evento visibles.
- Pagos visibles.
- Tablet entra con token y puede guardar un resultado de prueba controlado.
- Ranking recalcula.

## Reparacion de datos existentes

Si hay parejas creadas antes de las validaciones nuevas, pueden faltar filas en `event_registrations` o existir pagos asociados a lista de espera. El script de reparacion trabaja solo sobre la base apuntada por `DATABASE_URL`.

Primero revisar sin escribir:

```bash
cd backend
python scripts/repair_event_integrity.py
```

Aplicar solo despues de confirmar que Railway esta usando la base correcta:

```bash
cd backend
python scripts/repair_event_integrity.py --apply
```

No usar este script para copiar datos entre local y produccion. Solo normaliza la base actualmente conectada.

## Rollback

Si algo falla antes de escribir datos nuevos en Postgres:

1. Restaurar `DATABASE_URL` anterior.
2. Redeploy del backend.
3. Confirmar `GET /health/db`.

Si ya hubo escrituras en Postgres, exportar antes de revertir para no perder cambios.
