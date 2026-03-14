# Trust-Aware Adaptive Differential Privacy for Federated Learning in Heterogeneous IoT Environments

> **Research Prototype** — Interactive web dashboard for simulating and visualizing the TA-ADP framework proposed in:
>
> *"Trust-Aware Adaptive Differential Privacy for Resource-Constrained Federated Learning in Heterogeneous IoT Environments"*
> Seid Mehammed, Dr. Arnab Kumar Biswas, Shakir Khan

[![Node.js](https://img.shields.io/badge/Node.js-24-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Overview

This prototype implements and visualizes the **TA-ADP** (Trust-Aware Adaptive Differential Privacy) framework — a federated learning system that:

- **Adapts noise** per IoT device based on trust score and resource capacity
- **Selects clients** using a resource-aware strategy for communication efficiency
- **Guarantees (ε, δ)-DP** with bounded cumulative privacy loss under multi-round composition
- **Runs autonomously** — simulates all three IoT datasets (TON-IoT, Edge-IIoTset, Bot-IoT) on first startup, zero configuration required

### Core Formula (Adaptive Noise Scaling)

```
σᵢ = σ_max × max(0.1,  1 − α·trustᵢ − β·resourceᵢ)
```

Where:
- `σ_max = 2.0` — maximum noise scale
- `α` — trust weight (default 0.5)
- `β` — resource weight (default 0.3)
- `trustᵢ ∈ [0,1]` — device trust score
- `resourceᵢ = 0.4·compute + 0.3·battery + 0.3·bandwidth` — normalized resource capacity

Higher trust + higher resources → lower noise → more informative gradient update.

---

## Features

| Page | Description |
|---|---|
| **Dashboard** | Live metrics: final accuracy, cumulative privacy loss ε, active clients, convergence round. Charts: learning curve, method comparison (FedAvg / FedProx+DP / TA-ADP) |
| **Run Simulation** | Configure and launch FL simulations: number of clients/rounds, ε, δ, trust threshold, resource threshold, α/β weights, dataset |
| **Training Rounds** | Per-round metrics table and charts: global accuracy, loss, noise scale, privacy loss, communication cost, energy |
| **IoT Clients** | Device registry grid: type (sensor/wearable/industrial/vehicle/gateway), trust score progress bars, compute/battery/bandwidth |
| **Privacy Analysis** | Adaptive noise scatter plots, privacy budget allocation bars, cumulative ε chart under composition |
| **About TA-ADP** | Framework explanation, key equations, paper abstract, contribution summary |

---

## Project Structure

```
ta-adp-fl-prototype/
├── artifacts/
│   ├── api-server/              # Express 5 REST API
│   │   └── src/
│   │       ├── index.ts         # Server entry — triggers autoSeed() on startup
│   │       ├── app.ts           # CORS + JSON middleware + route mounting
│   │       ├── lib/
│   │       │   └── autoSeed.ts  # Autonomous simulation runner (runs on startup)
│   │       └── routes/
│   │           ├── simulation.ts  # POST /run, GET /results, GET+PUT /config
│   │           ├── clients.ts     # GET/POST /clients, GET /clients/:id
│   │           └── rounds.ts      # GET /rounds, GET /rounds/:id/client-updates
│   │
│   └── ta-adp-fl/               # React + Vite frontend
│       └── src/
│           ├── pages/
│           │   ├── dashboard.tsx    # Auto-boot loader + main dashboard
│           │   ├── simulation.tsx   # Simulation config form + run
│           │   ├── rounds.tsx       # Round-by-round metrics
│           │   ├── clients.tsx      # IoT device grid
│           │   ├── privacy.tsx      # Privacy analysis charts
│           │   └── about.tsx        # Framework explanation
│           └── components/
│               └── layout.tsx       # Sidebar navigation
│
├── lib/
│   ├── api-spec/openapi.yaml    # OpenAPI 3.1 contract (source of truth)
│   ├── api-client-react/        # Auto-generated React Query hooks
│   ├── api-zod/                 # Auto-generated Zod validation schemas
│   └── db/
│       └── src/schema/
│           ├── clients.ts       # iot_clients table
│           ├── simulations.ts   # simulations table
│           ├── rounds.ts        # fl_rounds table
│           └── clientUpdates.ts # client_updates table
│
└── scripts/                     # Utility scripts
```

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 20 (recommend 24) |
| pnpm | ≥ 9 |
| PostgreSQL | ≥ 14 |

Install pnpm if you don't have it:

```bash
npm install -g pnpm
```

---

## Quickstart — Reproduce in 5 Steps

### 1. Clone the Repository

```bash
git clone https://github.com/<your-username>/ta-adp-fl-prototype.git
cd ta-adp-fl-prototype
```

### 2. Install Dependencies

```bash
pnpm install
```

This installs all workspace packages in a single command.

### 3. Configure Environment Variables

Create a `.env` file in the root (or export variables in your shell):

```env
# PostgreSQL connection string — required for the API server
DATABASE_URL=postgresql://postgres:password@localhost:5432/ta_adp_fl

# Individual PG vars (alternative to DATABASE_URL)
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=password
PGDATABASE=ta_adp_fl

# Port for the API server (default 8080 if not set)
PORT=8080
```

> **Using Docker for PostgreSQL?** Run:
> ```bash
> docker run -d --name ta-adp-pg \
>   -e POSTGRES_PASSWORD=password \
>   -e POSTGRES_DB=ta_adp_fl \
>   -p 5432:5432 postgres:16
> ```

### 4. Push the Database Schema

```bash
pnpm --filter @workspace/db run push
```

This creates all four tables: `iot_clients`, `simulations`, `fl_rounds`, `client_updates`.

### 5. Start the Application

Open **two terminals**:

**Terminal 1 — API Server:**
```bash
pnpm --filter @workspace/api-server run dev
```

On first start, the server will **automatically**:
1. Detect that no simulations exist
2. Seed 20 heterogeneous IoT devices
3. Run all 3 FL simulations (TON-IoT, Edge-IIoTset, Bot-IoT × 50 rounds each)
4. Log progress and store all results to PostgreSQL

Expected output:
```
Server listening on port 8080
[autoSeed] No simulations found. Running autonomous TA-ADP initialization...
[autoSeed] Starting: "TA-ADP Auto-Run — TON-IoT" (50 rounds, dataset=TON-IoT)
[autoSeed] Completed: "TA-ADP Auto-Run — TON-IoT" | acc=0.80xx | rounds=50
[autoSeed] Starting: "TA-ADP Auto-Run — Edge-IIoTset" (50 rounds, dataset=Edge-IIoTset)
[autoSeed] Completed: "TA-ADP Auto-Run — Edge-IIoTset" | acc=0.86xx | rounds=50
[autoSeed] Starting: "TA-ADP Auto-Run — Bot-IoT" (50 rounds, dataset=Bot-IoT)
[autoSeed] Completed: "TA-ADP Auto-Run — Bot-IoT" | acc=0.79xx | rounds=50
[autoSeed] All 3 simulations complete. Dashboard is ready.
```

**Terminal 2 — Frontend:**
```bash
pnpm --filter @workspace/ta-adp-fl run dev
```

Open your browser at **http://localhost:5173** (or whichever port Vite assigns).

---

## API Reference

Base URL: `http://localhost:8080/api`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/healthz` | Server health check |
| `GET` | `/simulation/config` | Get current simulation parameters |
| `PUT` | `/simulation/config` | Update simulation parameters |
| `POST` | `/simulation/run` | Run a new FL simulation `{ "name": "My Run" }` |
| `GET` | `/simulation/results` | List all simulation results with round data |
| `GET` | `/clients` | List all IoT client devices |
| `POST` | `/clients` | Register a new IoT device |
| `GET` | `/clients/:id` | Get a specific client |
| `GET` | `/rounds?simulationId=N` | List FL rounds (filter by simulation) |
| `GET` | `/rounds/:id/client-updates` | Get all client updates for a round |

### Example — Run a Custom Simulation

```bash
# 1. Update config for a high-privacy run
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

# 2. Run the simulation
curl -X POST http://localhost:8080/api/simulation/run \
  -H "Content-Type: application/json" \
  -d '{ "name": "My Custom Run" }'

# 3. Fetch results
curl http://localhost:8080/api/simulation/results | jq '.[].finalAccuracy'
```

---

## Simulation Parameters

| Parameter | Default | Description |
|---|---|---|
| `numClients` | 20 | Number of IoT devices in the federation |
| `numRounds` | 50 | Number of federated learning rounds |
| `baseEpsilon` (ε) | 1.0 | Base privacy budget per round |
| `baseDelta` (δ) | 1e-5 | Failure probability for (ε,δ)-DP |
| `minTrustScore` | 0.3 | Minimum trust score for client selection |
| `resourceThreshold` | 0.2 | Minimum resource capacity for participation |
| `alphaWeight` (α) | 0.5 | Trust weight in noise scaling formula |
| `betaWeight` (β) | 0.3 | Resource weight in noise scaling formula |
| `dataset` | TON-IoT | Dataset label: `TON-IoT`, `Edge-IIoTset`, `Bot-IoT` |

### Default Autonomous Runs (at startup)

| Run | Dataset | ε | α | β | Rounds |
|---|---|---|---|---|---|
| Auto-Run 1 | TON-IoT | 1.0 | 0.5 | 0.3 | 50 |
| Auto-Run 2 | Edge-IIoTset | 1.0 | 0.5 | 0.3 | 50 |
| Auto-Run 3 | Bot-IoT | 0.5 | 0.6 | 0.3 | 50 |

---

## Database Schema

```sql
-- IoT device registry
CREATE TABLE iot_clients (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  device_type     TEXT NOT NULL,        -- sensor | wearable | industrial | vehicle | gateway
  trust_score     REAL NOT NULL,        -- [0.0, 1.0]
  compute_capacity REAL NOT NULL,       -- [0.0, 1.0] normalized
  battery_level   REAL NOT NULL,        -- [0.0, 1.0]
  bandwidth_mbps  REAL NOT NULL,        -- Mbps
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT NOW()
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
  final_accuracy          REAL NOT NULL,
  final_loss              REAL NOT NULL,
  avg_privacy_loss        REAL NOT NULL,
  avg_communication_cost  REAL NOT NULL,
  avg_energy_consumption  REAL NOT NULL,
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

## Regenerate API Code (after spec changes)

If you modify `lib/api-spec/openapi.yaml`, regenerate the TypeScript clients:

```bash
pnpm --filter @workspace/api-spec run codegen
```

This updates:
- `lib/api-client-react/src/generated/` — React Query hooks
- `lib/api-zod/src/generated/` — Zod validation schemas

---

## Production Build

```bash
# Type-check everything
pnpm run typecheck

# Build frontend (outputs to artifacts/ta-adp-fl/dist/)
pnpm --filter @workspace/ta-adp-fl run build

# Build API server (outputs to artifacts/api-server/dist/index.cjs)
pnpm --filter @workspace/api-server run build
```

---

## Troubleshooting

### "DATABASE_URL must be set" on startup
Export the environment variable before starting:
```bash
export DATABASE_URL=postgresql://postgres:password@localhost:5432/ta_adp_fl
pnpm --filter @workspace/api-server run dev
```

### Schema tables missing
Re-run the Drizzle push:
```bash
pnpm --filter @workspace/db run push
```
If that fails, force it:
```bash
pnpm --filter @workspace/db run push-force
```

### Simulations not appearing in dashboard
The auto-seed runs once at server startup only if the `simulations` table is empty. If you cleared the DB and restarted, the auto-seed will run again automatically. You can also trigger a manual run via the **Run Simulation** page in the UI.

### Frontend API calls fail (CORS / 404)
Ensure the API server is running on port 8080 and the frontend Vite dev server proxies `/api` requests correctly. The Vite config should forward `/api` → `http://localhost:8080`.

---

## Citation

If you use this prototype in your research, please cite:

```bibtex
@article{mehammed2025ta-adp,
  title   = {Trust-Aware Adaptive Differential Privacy for Resource-Constrained
             Federated Learning in Heterogeneous IoT Environments},
  author  = {Mehammed, Seid and Biswas, Arnab Kumar and Khan, Shakir},
  year    = {2025},
  note    = {Research prototype: https://github.com/<your-username>/ta-adp-fl-prototype}
}
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, TypeScript 5.9, Tailwind CSS v4, Recharts, Framer Motion, shadcn/ui |
| State / Data | TanStack React Query v5, Wouter (routing) |
| Backend | Node.js 24, Express 5, TypeScript |
| Database | PostgreSQL 16, Drizzle ORM, drizzle-zod |
| API Contract | OpenAPI 3.1, Orval (codegen) |
| Monorepo | pnpm workspaces |

---

## License

MIT © 2025 — Seid Mehammed
#
