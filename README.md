# Stack A: WASM‑first Composition Platform

Stack A is a WASM‑first code execution and AI orchestration platform that implements the "Sino‑Native Composer" architecture with UMCA security gates and observability. It coordinates a WebAssembly execution runtime, an HTTP orchestrator, and auxiliary services (IAM, RAG, vector DB, messaging) to provide a secure, observable, and portable automation surface.

- **Key features**:
  - **WASM‑first execution** with container fallback
  - **UMCA gates** (G0–G3) for authz, evaluation, runtime selection, and post‑execution validation
  - **Hono‑based orchestrator** with SSE event streaming
  - **MCP integration** with Dify (two‑way MCP) and RAGFlow (MCP server)
  - **Observability hooks** (OpenTelemetry, Phoenix evaluations placeholders)
- **Target audience**:
  - Platform and AI engineers needing secure code execution and orchestration
  - Teams composing AI tools, RAG systems, and agent workflows
  - Researchers and enterprises requiring compliance gates and auditability
- **Primary use cases**:
  - Execute user‑provided code via WASM with strict policies
  - Orchestrate multi‑service AI workflows (Dify, RAGFlow, vector DB)
  - Stream real‑time execution events to UIs (SSE) and message buses (RocketMQ)

---

## 1) Installation

### System requirements
- Linux/macOS (Windows via WSL2)
- Docker Engine ≥ 24.0 and Docker Compose plugin ≥ v2.26
- Node.js ≥ 20.0 (22.x supported)
- RAM: 16 GB recommended (for full local stack)
- Disk: 5 GB+ free

### Install prerequisites

1) Install Node.js (nvm recommended)
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# Restart shell, then
nvm install 20
nvm use 20
node -v
```

2) Install Docker Engine + Compose (Ubuntu example)
```bash
# Remove old versions
sudo apt-get remove -y docker docker-engine docker.io containerd runc || true
# Install dependencies
sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg
# Add Docker’s official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
# Setup repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
# Install engine + compose plugin
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
# Verify
docker --version && docker compose version
```

3) (Optional) Install Wasmtime CLI
```bash
curl https://wasmtime.dev/install.sh -sSf | bash
~/.wasmtime/bin/wasmtime --version
```

### Clone and bootstrap
```bash
git clone <repository-url>
cd 12_Stack_A_CoPi
```

1) Start core platform services (Keycloak and others as needed)
```bash
docker compose -f ops/compose/stack.yml up -d keycloak
# Start others when needed:
# docker compose -f ops/compose/stack.yml up -d milvus rocketmq-nameserver rocketmq-broker rocketmq-dashboard dify-db dify-redis dify-api dify-web ragflow
```

2) Install and run the orchestrator
```bash
cd apps/orchestrator
npm install
npm start
# Or development mode
# npm run dev
```

3) VS Code MCP integration (optional)
- Install the VS Code MCP extension
- Open this repo; `.vscode/mcp.json` registers Stack A servers and tools automatically

---

## 2) Configuration

### Environment variables (orchestrator)
These can be set in your shell, a `.env` file, or CI. Defaults shown reflect `apps/orchestrator/server.js`.

| Variable | Description | Default |
|---------|-------------|---------|
| PORT | Orchestrator HTTP port | 3000 |
| WASM_URL | HTTP endpoint for WASM runner | http://localhost:8001/run |
| KEYCLOAK_URL | Keycloak base URL | http://localhost:8080 |
| MILVUS_URL | Milvus endpoint | http://localhost:19530 |
| ROCKETMQ_URL | RocketMQ NameServer | http://localhost:9876 |
| DIFY_API_URL | Dify API URL | http://localhost:5001 |
| RAGFLOW_API_URL | RAGFlow API URL | http://localhost:9380 |

Example `.env` (local dev):
```bash
PORT=3000
WASM_URL=http://localhost:8001/run
KEYCLOAK_URL=http://localhost:8080
MILVUS_URL=http://localhost:19530
ROCKETMQ_URL=http://localhost:9876
DIFY_API_URL=http://localhost:5001
RAGFLOW_API_URL=http://localhost:9380
```

### Configuration files and locations
- `ops/compose/stack.yml` — Docker Compose for local services (Milvus, Keycloak, RocketMQ, Dify, RAGFlow)
- `apps/orchestrator/server.js` — Hono orchestrator implementation and endpoints
- `spin/code-runner-wasm/spin.toml` — Spin WASM app manifest and strict policies
- `.vscode/mcp.json` — VS Code MCP server and tool registration
- `ci/versions.json` — Version matrix used by CI workflow

### Third‑party credentials
- Keycloak admin (dev): `KEYCLOAK_ADMIN=admin`, `KEYCLOAK_ADMIN_PASSWORD=admin123` (from compose). Change in production.
- Dify: Uses `dify-db` (PostgreSQL), `dify-redis` with default credentials in compose. Change in production.
- Dify API `SECRET_KEY` is present in compose for convenience. Change immediately for production.
- RocketMQ dashboard: no auth by default. Restrict or front with a reverse proxy in production.

### Security considerations
- **Warning**: Never commit real secrets. Use `.env` (git‑ignored) or a secret manager.
- **Change defaults**: Replace default passwords and `SECRET_KEY` before exposing services.
- **Network egress**: `spin.toml` sets a strict allowlist; keep it minimal.
- **Filesystem**: WASM executor runs with `ENABLE_FILE_SYSTEM=false`; only enable with clear policies.
- **AuthN/Z**: Integrate Keycloak for OIDC; enforce JWT verification middleware when moving beyond demo mode.

---

## 3) Usage examples

### Health and basics
```bash
# Orchestrator health
curl http://localhost:3000/health
```

### Execute code via WASM path
cURL example:
```bash
curl -X POST http://localhost:3000/run \
  -H "Content-Type: application/json" \
  -d '{
    "spec": {
      "task": "console.log(\"Hello WASM\")",
      "language": "javascript",
      "preferWasm": true,
      "maxSeconds": 30
    }
  }'
```

Node.js example:
```javascript
// Run a task through the orchestrator
const res = await fetch('http://localhost:3000/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    spec: {
      task: 'console.log("Hello WASM")',
      language: 'javascript',
      preferWasm: true,
      maxSeconds: 30,
    },
  }),
});
const json = await res.json();
console.log(json);
```

### Subscribe to SSE event stream
```bash
# Prints initial connection event and keepalives
curl -N http://localhost:3000/stream
```

### Common use cases
- **Safe script runs**: WASM execution with time/memory caps
- **Policy gating**: G1 evaluation denies risky tasks (e.g., deletion, sudo)
- **Fallback**: If runtime selection deems WASM unsuitable, container path will be chosen (mocked in dev)

Expected error example (G1 gate fail):
```bash
curl -s -X POST http://localhost:3000/run \
  -H "Content-Type: application/json" \
  -d '{"spec": {"task": "sudo rm -rf /", "language": "javascript", "preferWasm": true}}' | jq
# => 400 with { error: "Task failed G1 evaluation", gate: "G1", ... }
```

---

## 4) API documentation

Base URL (local): `http://localhost:3000`

### GET /health
- Description: Orchestrator health summary and configured service URLs
- Response 200 example:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "services": {
    "wasm": "http://localhost:8001/run",
    "keycloak": "http://localhost:8080",
    "milvus": "http://localhost:19530",
    "rocketmq": "http://localhost:9876"
  }
}
```

### POST /auth/login
- Description: Returns OIDC details for Keycloak login (demo helper)
- Request: none
- Response 200 example:
```json
{
  "redirectUri": "http://localhost:8080/realms/stacka/protocol/openid-connect/auth",
  "clientId": "stacka-orchestrator",
  "scope": "openid profile email"
}
```

### GET /stream (SSE)
- Description: Server‑sent events with UMCA event messages and keepalives
- Headers: `Content-Type: text/event-stream`
- Response: Event stream (no fixed schema; includes `execution_start`, `gate_check`, `execution_complete`)

### POST /run
- Description: Execute a task via WASM‑first runtime selection with UMCA gating
- Request body (JSON):
```json
{
  "spec": {
    "task": "console.log(\"Hello\")",
    "language": "javascript",
    "preferWasm": true,
    "requiresNative": false,
    "maxSeconds": 30
  }
}
```
- Fields:
  - `task` (string, required): Code or operation description
  - `language` (string, optional): `javascript|typescript|rust|go|python` (WASM path supports a subset)
  - `preferWasm` (boolean, optional, default true)
  - `requiresNative` (boolean, optional): forces container fallback
  - `maxSeconds` (number, optional): execution timeout
- Responses:
  - 200: `{ sessionId, runtime: "wasm|container", result, gates }`
  - 400: `{ error, gate: "G1", score, reason }` (failed evaluation)
  - 500: `{ error }` (internal failure)

### GET /mcp/tools
- Description: MCP tool discovery for IDE integration
- Response 200 example (truncated):
```json
{ "tools": [{ "name": "execute_code", "description": "Execute code using Stack A WASM-first orchestrator" }] }
```

#### Authentication
- Dev mode: endpoints are accessible without JWT verification (demo only)
- Production: secure behind Keycloak OIDC, enforce JWT validation in middleware and restrict CORS

#### Rate limiting and quotas
- Not implemented in this demo. Recommended: apply reverse proxy (e.g., NGINX/Envoy) or gateway‑level rate limits and authz enforcement.

#### Error handling
- Errors are JSON `{ "error": string }` with appropriate HTTP codes. Additional context may be emitted on the SSE stream as `error` events.

---

## 5) Testing

### Quick smoke tests (local)
```bash
# Start Keycloak for basic G0 checks
docker compose -f ops/compose/stack.yml up -d keycloak
# Start a mock WASM runner (like CI)
node - <<'EOF'
const http=require('http');
http.createServer((req,res)=>{
  if(req.url==='/health'){res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({status:'healthy'}));}
  else if(req.url==='/run' && req.method==='POST'){let b='';req.on('data',c=>b+=c);req.on('end',()=>{res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({output:'Mock WASM execution completed',runtime:'wasm',exitCode:0,executionTime:100}))});}
  else{res.writeHead(404);res.end();}
}).listen(8001,'127.0.0.1');
console.log('Mock WASM service on 8001');
EOF
# Start orchestrator
(cd apps/orchestrator && npm install && npm start &)
# Wait and test
sleep 2
curl -f http://localhost:3000/health
curl -X POST http://localhost:3000/run -H 'Content-Type: application/json' -d '{"spec":{"task":"console.log(\"hi\")","language":"javascript"}}'
```

### Test suite
- Orchestrator `npm test` currently returns a placeholder. Add unit tests with your preferred runner (Vitest/Jest) and update CI accordingly.

### Continuous integration
- Workflow: `.github/workflows/stackA-smoke.yml`
  - Loads versions from `ci/versions.json`
  - Installs Wasmtime
  - Starts minimal services (Keycloak) and a mock WASM runner
  - Validates UMCA gates (G0–G3) via HTTP checks and SSE
- Triggers:
  - On push to `main` and `feat/stackA-implementation`
  - On PR to `main`
  - Manual `workflow_dispatch` with `include_k8s` toggle
- Optional K8s job: kinD + SpinKube operator installation when `include_k8s=true` or commit message contains `[full-ci]`

### Debugging failures
1. Check orchestrator logs in the CI step output
2. Verify `WASM_URL` and mock service health (`curl http://localhost:8001/health`)
3. Inspect SSE output to confirm gate events
4. For compose services: `docker compose -f ops/compose/stack.yml ps` and `... logs <service>`

---

## 6) Contribution guidelines

### Code style
- Use modern ES modules and TypeScript for new code where possible
- 2‑space indentation, trailing commas where supported
- Prefer small, pure functions and clear naming
- Add JSDoc/TSDoc for public functions and endpoints

### Pull request process
1. Create a feature branch: `git checkout -b feat/your-feature`
2. Update or add tests (unit + smoke where applicable)
3. Run local smoke checks (`/health`, `/run`, SSE)
4. Ensure CI passes
5. Submit PR with a clear description and impact notes

### Issue reporting
- Title: concise problem statement
- Body:
  - Environment (OS, Node, Docker versions)
  - Steps to reproduce
  - Expected vs actual behavior
  - Logs and relevant configs (redact secrets)

### Branch naming
- `feat/<short-name>` — new features
- `fix/<short-name>` — bug fixes
- `chore/<short-name>` — maintenance
- `docs/<short-name>` — documentation

---

## 7) License

MIT License

Copyright (c) 2025 Stack A Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## 8) Version history / Changelog

- 1.0.0 (current)
  - Hono orchestrator with endpoints: `/health`, `/auth/login`, `/run`, `/stream`, `/mcp/tools`
  - WASM‑first path with runtime selector and container fallback (mock)
  - UMCA gates G0–G3 (baseline checks and placeholders)
  - Docker Compose stack for Milvus, Keycloak, RocketMQ(+Dashboard), Dify, RAGFlow
  - VS Code MCP configuration and CI smoke tests

### Migration notes
- If upgrading from pre‑1.0 prototypes:
  - Ensure `WASM_URL` now points to `/run`
  - Update CI to use `ci/versions.json`
  - Adopt `.vscode/mcp.json` structure for IDE integration

### Deprecations
- None at this time. Future releases may replace the mock container executor with E2B/Kata integration.

---

## 9) Additional documentation
- Service Inventory: `docs/stackA/inventory.md`
- Architecture Diagram: `docs/stackA/architecture.mermaid`
- Feasibility Analysis for CI runners: `docs/stackA/feasibility.md`
- 2025 Standards plan and background: `docs/00_pivoting_to_2025_standards.md`

---

## Quick commands

```bash
# Start only Keycloak (for auth flow demos)
docker compose -f ops/compose/stack.yml up -d keycloak

# Start full stack (resource heavy)
docker compose -f ops/compose/stack.yml up -d

# Orchestrator dev
(cd apps/orchestrator && npm install && npm run dev)

# SSE test
curl -N http://localhost:3000/stream
```