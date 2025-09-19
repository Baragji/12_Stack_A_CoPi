# GitHub Agents Panel Task: Stack A + Gemini Analysis Implementation

## Context
You are the only developer. Work PR-natively in this repo using the GitHub Agents panel. Operate only on GitHub-hosted runners.

**If SSOT docs (00_pivoting_to_2025_standards.md, 00b_gemini_analysis.md) are missing, ask me to upload them.**

You are implementing the Stack A (Sino-Native Composer) system with WASM-first execution, as analyzed in the attached SSOT documents. Work entirely PR-native using GitHub-hosted infrastructure.

## Branch/PR Setup
- Create branch: `feat/stackA-implementation`  
- PR title: "Stack A: WASM-first CI harness, docs, and gates"

## Primary Deliverables

### 1. Service Inventory & Architecture (`docs/stackA/`)
- `inventory.md`: Complete list of all services from SSOT docs with versions, purposes, dependencies
- `architecture.mermaid`: System diagram showing WASM-first execution path, MCP connections, event flows
- `feasibility.md`: GitHub runner compatibility analysis per service with alternatives for heavy components

### 2. Version Matrix System
- `ci/versions.json`: Single source of truth for all service versions
```json
{
  "node": ["20", "22"],
  "milvus": ["v2.6.0"],
  "rocketmq_dashboard": ["2.1.0"], 
  "keycloak": ["26.3.2"],
  "dify": ["v1.6.0"],
  "ragflow": ["main"],
  "wasmtime": ["36.0.0"]
}
```

### 3. CI Implementation (`.github/workflows/stackA-smoke.yml`)
Load `ci/versions.json` with `${{ fromJSON() }}` matrix strategy to enable version flexibility.

#### Ephemeral Services Stack
Use service containers or Docker Compose to run:
- Dify v1.7 or higher (two-way MCP)
- RAGFlow + MCP server  
- Milvus 2.6.0 or higher standalone
- RocketMQ 5.3 + Dashboard 2.1.0
- Keycloak 26.3 (dev mode)
- Hono orchestrator with AgentScope

#### Optional Second Job (run only if requested)
Separate job for heavy K8s validation:
- Install SpinKube components in kinD cluster
- Deploy sample WASM code-runner with Wasmtime
- Test runtime selection: WASM default → container fallback

### 4. Smoke Tests & Gates
- Orchestrator endpoints (`/run`, `/stream` with SSE)
- RocketMQ pub/sub messaging
- OIDC flow with Keycloak
- WASM execution with egress policy
- MCP server connectivity (Dify ↔ RAGFlow)

### 5. Annotations & Observability
**Required annotations support:**
- Workflow command notices/errors (`::error::`, `::warning::`, `::notice::`)
- Registered problem matcher JSON for test output parsing
- At least one Checks API POST for file/line diagnostics
- Job Summary with gate results (Phoenix eval thresholds)
- OpenTelemetry/OpenLLMetry integration points

### 6. Implementation Files
- `apps/orchestrator/server.ts`: Hono + AgentScope with OIDC, SSE, runtime selection
- `spin/code-runner-wasm/spin.toml`: WASM app with strict egress allowlist
- `ops/compose/stack.yml`: Complete service stack for CI
- `.github/ci/problem-matcher.json`: Test output parsing

## Technical Constraints
- Pin all container images by digest
- Use GitHub Actions marketplace actions for toolchain setup
- Keep test datasets minimal for ephemeral runners
- No mocks - real services with production-grade configuration
- Follow UMCA gate patterns (G0-G3) from SSOT docs

## Acceptance Criteria
- Green CI run on at least one matrix combination
- All services start and communicate successfully
- WASM execution path works with fallback to containers
- Annotations show precise failure locations
- Job Summary provides comprehensive gate status
- MCP servers respond and can be registered in VS Code

## Success Metrics
- Complete Stack A architecture running in GitHub CI
- Version matrix allows easy service updates
- Comprehensive documentation for operator onboarding  
- PR demonstrates WASM-first execution with security boundaries