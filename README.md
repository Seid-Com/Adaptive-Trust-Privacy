# TA-ADP: Trust-Aware Adaptive Differential Privacy 

>
> *"Trust-Aware Adaptive Differential Privacy "*
> **Seid Mehammed Abdu · Dr. Arnab Kumar Biswas · Shakir Khan, Dr. Seid Kassaw**
> *IEEE Access (Under Review)*

---

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite)](https://vite.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm)](https://pnpm.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Table of Contents

1. [Overview](#overview)
2. [Core Algorithm](#core-algorithm)
3. [Application Pages](#application-pages)
4. [Project Structure](#project-structure)
5. [Prerequisites](#prerequisites)
6. [Quickstart](#quickstart)
7. [Datasets](#datasets)
8. [API Reference](#api-reference)
9. [Simulation Parameters](#simulation-parameters)
10. [Database Schema](#database-schema)
11. [Regenerate API Code](#regenerate-api-code)
12. [Production Build](#production-build)
13. [Troubleshooting](#troubleshooting)
14. [Tech Stack](#tech-stack)
15. [Citation](#citation)
16. [License](#license)

---

## Overview

This repository is the companion prototype for the **TA-ADP** framework . It provides:

- **Live FL simulation** — runs federated learning rounds with adaptive Gaussian noise per IoT device
- **Automatic seeding** — on first startup, seeds 20 heterogeneous IoT devices and runs 3 baseline simulations (TON-IoT, Edge-IIoTset, Bot-IoT) with zero configuration

- **Full REST API** — every simulation, round, and client update is persisted in PostgreSQL and queryable via OpenAPI-specified endpoints

---

## Core Algorithm

### Adaptive Noise Scaling Formula

```
σᵢ = σ_max × max(0.1,  1 − α·trustᵢ − β·resourceᵢ)
```

| Symbol | Default | Meaning |
|---|---|---|
| `σ_max` | 2.0 | Maximum noise scale (noise floor = 0.1 × σ_max) |
| `α` | 0.5 | Trust weight |
| `β` | 0.3 | Resource weight |
| `trustᵢ` | [0,1] | Cosine-similarity-derived trust score |
| `resourceᵢ` | [0,1] | `0.4·compute + 0.3·battery + 0.3·(bandwidth/100)` |

**Interpretation:** Higher trust + higher resources → lower noise → more informative gradient update, while still satisfying (ε, δ)-DP at the client level.

### Privacy Guarantee

The framework provides formal **(ε, δ)-Differential Privacy** using:
- **Rényi Differential Privacy (RDP)** composition across rounds
- A **mandatory noise floor** (`σ_min = 0.1`) that prevents unbounded privacy loss
- Bounded cumulative ε under multi-round composition

---

## Application Pages

| Page | Route | Description |
|---|---|---|
| **Dashboard** | `/` | Live metrics: final accuracy, cumulative ε, active clients, convergence round. Learning curve and method comparison charts auto-populated from simulation results. |
| **Run Simulation** | `/simulation` | Configure and launch custom FL runs: clients, rounds, ε, δ, trust threshold, resource threshold, α/β weights, dataset selection. |
| **Training Rounds** | `/rounds` | Per-round metrics table and charts: global accuracy, loss, avg noise scale, avg trust score, cumulative privacy loss, communication cost, energy consumed. |
| **IoT Clients** | `/clients` | Device registry: sensor/wearable/industrial/vehicle/gateway types, trust score bars, compute/battery/bandwidth indicators. |
| **Privacy Analysis** | `/privacy` | Scatter plot of trust score vs. assigned noise scale per client. Privacy budget allocation and composition analysis. |


---

## Project Structure

```
ta-adp-fl-prototype/
│
├── artifacts/
│   ├── api-server/                    # Express 5 REST API (port 8080)
│   │   └── src/
│   │       ├── index.ts               # Entry point — triggers autoSeed() on startup
│   │       ├── app.ts                 # CORS + JSON middleware + /api route mount
│   │       ├── lib/
│   │       │   └── autoSeed.ts        # Autonomous runner: seeds devices + runs 3 simulations
│   │       └── routes/
│   │           ├── simulation.ts      # POST /run · GET /results · GET+PUT /config
│   │           ├── clients.ts         # GET+POST /clients · GET /clients/:id
│   │           └── rounds.ts          # GET /rounds · GET /rounds/:id/client-updates
│   │
│   └── ta-adp-fl/                     # React 19 + Vite 7 frontend
│       └── src/
│           ├── pages/
│           │   ├── dashboard.tsx      # Live metrics + learning curve charts
│           │   ├── simulation.tsx     # FL simulation config + run form
│           │   ├── rounds.tsx         # Per-round metrics table
│           │   ├── clients.tsx        # IoT device registry grid
│           │   ├── privacy.tsx        # Adaptive noise scatter + privacy analysis
│           │   ├── table3a.tsx        # IEEE Table 3a generator (edit + export)
│           │   ├── rebuttal.tsx       # Reviewer response letter generator
│           │   ├── figures.tsx        # IEEE-quality figure export (300 DPI PNG)
│           │   └── about.tsx          # Framework description
│           └── components/
│               └── layout.tsx         # Sidebar navigation (all routes)
│
├── lib/
│   ├── api-spec/
│   │   └── openapi.yaml               # OpenAPI 3.1 contract — source of truth
│   ├── api-client-react/
│   │   └── src/generated/api.ts       # Auto-generated TanStack Query hooks
│   ├── api-zod/
│   │   └── src/generated/             # Auto-generated Zod validation schemas
│   └── db/
│       ├── drizzle.config.ts
│       └── src/schema/
│           ├── clients.ts             # iot_clients table
│           ├── simulations.ts         # simulations table
│           ├── rounds.ts              # fl_rounds table
│           └── clientUpdates.ts       # client_updates table
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 20 (recommend 20+) | [nodejs.org](https://nodejs.org/) |
| pnpm | ≥ 9 | `npm install -g pnpm` |
| PostgreSQL | ≥ 14 | Local install or Docker |

---

## Quickstart

### 1. Clone

```bash
git clone https://github.com/<your-username>/ta-adp-fl-prototype.git
cd ta-adp-fl-prototype
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment variables

Create a `.env` file at the project root:

```env
# PostgreSQL — required for API server
DATABASE_URL=postgresql://postgres:password@localhost:5432/ta_adp_fl

# Or individual vars (either form works)
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=password
PGDATABASE=ta_adp_fl

# API server port
PORT=8080
```

> **Using Docker for PostgreSQL:**
> ```bash
> docker run -d --name ta-adp-pg \
>   -e POSTGRES_PASSWORD=password \
>   -e POSTGRES_DB=ta_adp_fl \
>   -p 5432:5432 postgres:16
> ```

### 4. Push the database schema

```bash
pnpm --filter @workspace/db run push
```

Creates four tables: `iot_clients`, `simulations`, `fl_rounds`, `client_updates`.

### 5. Start the API server

```bash
pnpm --filter @workspace/api-server run dev
```

On **first launch**, the server automatically:
1. Detects an empty `simulations` table
2. Seeds **20 heterogeneous IoT devices** (sensors, wearables, industrial, vehicles, gateways)
3. Runs **3 FL simulations** — one per dataset (50 rounds each)
4. Stores all results to PostgreSQL

Expected terminal output:
```
Server listening on port 8080
[autoSeed] No simulations found. Running autonomous TA-ADP initialization...
[autoSeed] Starting: "TA-ADP Auto-Run — TON-IoT" (50 rounds, dataset=TON-IoT)
[autoSeed] Completed: "TA-ADP Auto-Run — TON-IoT" | acc=0.8625 | rounds=50
[autoSeed] Starting: "TA-ADP Auto-Run — Edge-IIoTset" (50 rounds, dataset=Edge-IIoTset)
[autoSeed] Completed: "TA-ADP Auto-Run — Edge-IIoTset" | acc=0.8034 | rounds=50
[autoSeed] Starting: "TA-ADP Auto-Run — Bot-IoT" (50 rounds, dataset=Bot-IoT)
[autoSeed] Completed: "TA-ADP Auto-Run — Bot-IoT" | acc=0.8661 | rounds=50
[autoSeed] All 3 simulations complete. Dashboard is ready.
```

### 6. Start the frontend

```bash
pnpm --filter @workspace/ta-adp-fl run dev
```

Open **http://localhost:5173** in your browser.

---

## Datasets

The simulation engine models the statistical properties of three real-world IoT security datasets. To reproduce experiments with **actual traffic data**, download the datasets from their official sources:

| Dataset | Reference | Download |
|---|---|---|
| **TON-IoT** | Alsaedi et al., *IEEE Access*, 2020 | [UNSW Sydney](https://research.unsw.edu.au/projects/toniot-datasets) |
| **Edge-IIoTset** | Ferrag et al., *IEEE Access*, 2022 | [Kaggle](https://www.kaggle.com/datasets/mohamedamineferrag/edgeiiotset-cyber-security-dataset-of-iot-iiot) |
| **Bot-IoT** | Koroniotis et al., *FGCS*, 2019 | [UNSW Sydney](https://research.unsw.edu.au/projects/bot-iot-dataset) |

### Recommended split

```
Train: 70% · Validation: 10% · Test: 20%
```

---

## API Reference

Base URL: `http://localhost:8080/api`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/healthz` | Server health check |
| `GET` | `/simulation/config` | Get current simulation parameters |
| `PUT` | `/simulation/config` | Update simulation parameters |
| `POST` | `/simulation/run` | Launch a new FL simulation `{ "name": "..." }` |
| `GET` | `/simulation/results` | List all results with embedded round data |
| `GET` | `/clients` | List all IoT client devices |
| `POST` | `/clients` | Register a new IoT device |
| `GET` | `/clients/:id` | Get a specific client |
| `GET` | `/rounds?simulationId=N` | List FL rounds (filterable by simulation) |
| `GET` | `/rounds/:id/client-updates` | Per-client updates for a given round |

### Example — run a custom high-privacy simulation

```bash
# 1. Configure parameters
curl -X PUT http://localhost:8080/api/simulation/config \
  -H "Content-Type: application/json" \
  -d '{
    "numClients": 20,
    "numRounds": 50,
    "baseEpsilon": 0.5,
    "baseDelta": 1e-5,
    "minTrustScore": 0.4,
    "resourceThreshold": 0.3,
    "alphaWeight": 0.6,
    "betaWeight": 0.3,
    "dataset": "Bot-IoT"
  }'

# 2. Run
curl -X POST http://localhost:8080/api/simulation/run \
  -H "Content-Type: application/json" \
  -d '{ "name": "High-Privacy Bot-IoT Run" }'

# 3. Fetch final accuracy
curl http://localhost:8080/api/simulation/results | jq '.[-1].finalAccuracy'
```

---

## Simulation Parameters

| Parameter | Default | Description |
|---|---|---|
| `numClients` | 20 | IoT devices in the federation |
| `numRounds` | 50 | Federated learning rounds |
| `baseEpsilon` (ε) | 1.0 | Base privacy budget per round |
| `baseDelta` (δ) | 1e-5 | (ε,δ)-DP failure probability |
| `minTrustScore` | 0.3 | Minimum trust score for client selection |
| `resourceThreshold` | 0.2 | Minimum normalised resource capacity |
| `alphaWeight` (α) | 0.5 | Trust weight in noise formula |
| `betaWeight` (β) | 0.3 | Resource weight in noise formula |
| `dataset` | TON-IoT | `TON-IoT` · `Edge-IIoTset` · `Bot-IoT` |

### Auto-seeded runs (on first startup)

| Run | Dataset | ε | α | β |
|---|---|---|---|---|
| Auto-Run 1 | TON-IoT | 1.0 | 0.5 | 0.3 |
| Auto-Run 2 | Edge-IIoTset | 1.0 | 0.5 | 0.3 |
| Auto-Run 3 | Bot-IoT | 0.5 | 0.6 | 0.3 |

---

## Database Schema

```sql
-- IoT device registry
CREATE TABLE iot_clients (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  device_type       TEXT NOT NULL,       -- sensor|wearable|industrial|vehicle|gateway
  trust_score       REAL NOT NULL,       -- [0.0, 1.0]
  compute_capacity  REAL NOT NULL,       -- [0.0, 1.0] normalised
  battery_level     REAL NOT NULL,       -- [0.0, 1.0]
  bandwidth_mbps    REAL NOT NULL,       -- Mbps
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMP DEFAULT NOW()
);

-- FL simulation runs
CREATE TABLE simulations (
  id                      SERIAL PRIMARY KEY,
  name                    TEXT NOT NULL,
  dataset                 TEXT NOT NULL,
  num_clients             INTEGER NOT NULL,
  num_rounds              INTEGER NOT NULL,
  base_epsilon            REAL NOT NULL,
  base_delta              REAL NOT NULL,
  min_trust_score         REAL NOT NULL,
  resource_threshold      REAL NOT NULL,
  alpha_weight            REAL NOT NULL,
  beta_weight             REAL NOT NULL,
  final_accuracy          REAL,
  final_loss              REAL,
  avg_privacy_loss        REAL,
  avg_communication_cost  REAL,
  avg_energy_consumption  REAL,
  convergence_round       INTEGER,
  created_at              TIMESTAMP DEFAULT NOW()
);

-- Per-round global metrics
CREATE TABLE fl_rounds (
  id                      SERIAL PRIMARY KEY,
  simulation_id           INTEGER REFERENCES simulations(id),
  round_number            INTEGER NOT NULL,
  global_accuracy         REAL NOT NULL,
  global_loss             REAL NOT NULL,
  num_selected_clients    INTEGER NOT NULL,
  avg_noise_scale         REAL NOT NULL,
  avg_trust_score         REAL NOT NULL,
  cumulative_privacy_loss REAL NOT NULL,
  communication_cost      REAL NOT NULL,
  energy_consumed         REAL NOT NULL
);

-- Per-client-per-round updates
CREATE TABLE client_updates (
  id                   SERIAL PRIMARY KEY,
  round_id             INTEGER REFERENCES fl_rounds(id),
  client_id            INTEGER REFERENCES iot_clients(id),
  client_name          TEXT NOT NULL,
  device_type          TEXT NOT NULL,
  trust_score          REAL NOT NULL,
  resource_capacity    REAL NOT NULL,
  noise_scale          REAL NOT NULL,
  local_accuracy       REAL NOT NULL,
  privacy_budget_used  REAL NOT NULL,
  communication_bytes  INTEGER NOT NULL,
  energy_used          REAL NOT NULL,
  selected             BOOLEAN DEFAULT TRUE
);
```

---

## Regenerate API Code

If you modify `lib/api-spec/openapi.yaml`, regenerate the TypeScript clients:

```bash
pnpm --filter @workspace/api-spec run codegen
```

This updates:
- `lib/api-client-react/src/generated/` — TanStack React Query hooks
- `lib/api-zod/src/generated/` — Zod validation schemas

---

## Production Build

```bash
# Type-check the entire workspace
pnpm run typecheck

# Build frontend → artifacts/ta-adp-fl/dist/
pnpm --filter @workspace/ta-adp-fl run build

# Build API server → artifacts/api-server/dist/index.cjs
pnpm --filter @workspace/api-server run build
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `DATABASE_URL must be set` on startup | `export DATABASE_URL=postgresql://...` before running |
| `relation "simulations" does not exist` | Run `pnpm --filter @workspace/db run push` |
| Simulations not appearing in dashboard | Auto-seed runs once when the table is empty. Clear and restart, or use **Run Simulation** in the UI |
| Frontend API calls return 404 | Confirm the API server is on port 8080 and the Vite proxy config forwards `/api` → `http://localhost:8080` |
| `pnpm: command not found` | Install with `npm install -g pnpm` |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 7, TypeScript 5.9, Tailwind CSS v4, Recharts, Framer Motion, shadcn/ui (Radix UI) |
| **State / Data** | TanStack React Query v5, Wouter (routing) |
| **Backend** | Node.js 20+, Express 5, TypeScript, tsx |
| **Database** | PostgreSQL 16, Drizzle ORM, drizzle-zod |
| **API Contract** | OpenAPI 3.1, Orval (codegen → React Query + Zod) |
| **Monorepo** | pnpm workspaces |

---

## Citation





---

## License

MIT © 2025 — Seid Mehammed Abdu, Arnab Kumar Biswas, Shakir Khan, Dr. Seid Kassaw
