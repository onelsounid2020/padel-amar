# Padel Manager

Aplicación web MVP para gestionar eventos de pádel con FastAPI, PostgreSQL, SQLAlchemy y React + Vite.

## Estructura

- `backend/`: API REST, modelos SQLAlchemy y lógica de standings.
- `frontend/`: interfaz React para dashboard, eventos, jugadores, parejas, pagos, partidos, ranking y texto WhatsApp.

## Backend local

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

La API queda en `http://localhost:8000` y la documentación en `http://localhost:8000/docs`.

Para correr los tests backend usa el Python del entorno virtual, no el Python global:

```bash
cd backend
.venv/bin/python -m unittest discover -s tests
```

## Frontend local

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

La app queda en `http://localhost:5173`.

## Variables para Railway

Backend:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
FRONTEND_URL=https://tu-frontend.railway.app
```

Frontend:

```env
VITE_API_URL=https://tu-backend.railway.app
```

## Endpoints principales

- `GET /events/dashboard`
- `POST /events`
- `POST /players`
- `POST /events/{event_id}/pairs`
- `GET /events/{event_id}/payments`
- `PATCH /events/{event_id}/payments/{payment_id}`
- `POST /events/{event_id}/matches`
- `POST /events/{event_id}/matches/generate-fixture?minimum_matches=5`
- `PATCH /events/{event_id}/matches/{match_id}/result`
- `GET /events/{event_id}/standings`
- `GET /events/{event_id}/standings/ranking-final`
- `GET /events/{event_id}/whatsapp`
