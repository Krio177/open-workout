# Open Workout

Egyszeru, on-hostolt edzeskoveto webalkalmazas. JSON-alapu edzestervek, szett-naplazas, personal record kovetes Brzycki 1RM formulaval.

## Stack

- **Backend:** Hono.js + Node.js
- **Adatbazis:** PostgreSQL 16
- **Frontend:** Tailwind CSS + Alpine.js (SPA-stilus, nincs build lepes)
- **Container:** Docker Compose

## Funkciok

- Edzestervek definialasa JSON fajlokkal (mell, hat, lab, valld)
- Edzes session inditas, szettek naplzasa
- Personal record (PR) automatikus detektalasa
- Brzycki 1RM szamitas
- Naptar es tortenet nezet
- Osszefoglalo edzesenkent

## Gyors inditas

```bash
# Adatbazis inditasa
docker compose up -d

# Schema letrehozasa
npm run db:init

# Szerver inditasa
npm start
```

A `.env` fajlban allitsd be az adatbazis kapcsolatot (ha elter a defaulttol):

```
DATABASE_URL=postgres://tibi:tibi@localhost:5433/open_workout
```

## Projekt felepites

```
server.js              # Hono API szerver
db/
  client.js            # PostgreSQL kapcsolat
  schema.sql           # Adatbazis schema
public/
  index.html           # Dashboard - edzes valaszto
  workout.html         # Aktiv edzes session
  summary.html         # Edzes osszefoglalo
  calendar.html        # Naptar nezet
  history.html         # Tortenet
workouts/
  chest-day.json       # Mell nap
  back-day.json        # Hat nap
  leg-day.json         # Lab nap
  shoulder-day.json    # Vall nap
```

## API vegpontok

| Method | Endpoint | Leiras |
|--------|----------|--------|
| GET | `/api/workouts` | Osszes edzesterv listazasa |
| GET | `/api/workouts/:id` | Egy edzesterv lekerese |
| POST | `/api/sessions` | Uj session inditasa |
| GET | `/api/sessions/:id` | Session lekerese szettekkel |
| PUT | `/api/sessions/:id/finish` | Session lezarasa |
| DELETE | `/api/sessions/:id` | Session torlese |
| GET | `/api/sessions` | Session tortenet (datum szuro) |
| POST | `/api/sessions/:id/sets` | Uj szett rogzitese (PR detektalassal) |
| GET | `/api/prs` | Personal recordok listazasa |

## Uj edzestipus hozzaadasa

Hozz letre egy JSON fajlt a `workouts/` konyvtarban:

```json
{
  "id": "arm-day",
  "name": "Kar nap",
  "defaultRestSeconds": 60,
  "color": "#10b981",
  "exercises": [
    {
      "order": 1,
      "name": "Bicepszenyomas",
      "equipment": "dumbbell",
      "defaultWeight": 12,
      "defaultReps": 10,
      "restSeconds": 60,
      "notes": "Szupinacios fogas",
      "image": "/images/dumbbell-curl.svg"
    }
  ]
}
```

### Mezok

**Gyakorlat szint:**
| Mezo | Kotelezo | Leiras |
|------|----------|--------|
| `id` | igen | Egyedi azonosito (pl. "arm-day"), a fajlnevvel egyezzen |
| `name` | igen | Megjelenitendo nev |
| `defaultRestSeconds` | igen | Alapertelmezett pihenoido setek kozott |
| `color` | nem | Akcentus szin hex formataban (pl. "#10b981") |

**Gyakorlat szint:**
| Mezo | Kotelezo | Leiras |
|------|----------|--------|
| `order` | igen | Sorrend szam |
| `name` | igen | Gyakorlat neve |
| `equipment` | igen | Eszkoz tipus (barbell, dumbbell, cable, machine) |
| `defaultWeight` | igen | Alapertelmezett suly kg-ban |
| `defaultReps` | igen | Alapertelmezett ismetlesszam |
| `restSeconds` | nem | Pihenoido setek kozott (felulirja a defaultot) |
| `notes` | nem | Megjegyzes, utasitas |
| `image` | nem | SVG kep utvonal a `public/images/` mappabol |

A szerver automatikusan betolti a `workouts/` mappaban talalhato osszes JSON fajlt indulaskor.
