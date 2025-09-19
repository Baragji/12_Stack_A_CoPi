# Stack A Service Inventory

This inventory enumerates every service required to stand up Stack A (Sino-Native Composer) with WASM-first execution as described in the SSOT briefs. Each entry lists the target version(s), its primary responsibilities, and the upstream dependencies it expects inside CI.

## Control & Experience Plane

| Service | Target Version(s) | Purpose | Dependencies |
| --- | --- | --- | --- |
| Dify (API, worker, web, sandbox) | 1.8.1 (>= 1.7 two-way MCP) | Operator console, flow editor, MCP tool hub, job queue | PostgreSQL 15, Redis 6, optional S3-compatible object store (MinIO baked into CI), RocketMQ topic registration via orchestrator |
| RAGFlow (with bundled MCP server) | v1.0 mainline | Document ingestion, deep retrieval, exposes MCP server for tool registrations | MySQL 8.0, Milvus 2.6.0, MinIO (S3), optional Elasticsearch (disabled for CI) |
| VS Code Agent Mode (external) | N/A (consumer) | IDE cockpit that consumes MCP endpoints from Dify/RAGFlow/orchestrator | Requires MCP endpoints reachable over HTTPS (proxied via orchestrator) |
| Hono + AgentScope orchestrator | Node.js 20/22 runtime | Multi-agent planner/coder/tester pipeline, SSE relay, policy enforcement | RocketMQ 5.3 topic, Phoenix eval API, Keycloak OIDC, Wasmtime 36 runtime, E2B fallback |
| Keycloak | 26.3.2 (dev mode) | Identity provider (OIDC), UMCA G0 gating | PostgreSQL (embedded dev DB), TLS optional (terminated by runner) |

## Data & Messaging Plane

| Service | Target Version(s) | Purpose | Dependencies |
| --- | --- | --- | --- |
| Milvus | v2.6.0 | Vector store for Dify & RAGFlow projects | Uses embedded etcd/minio/rocksmq in standalone mode |
| RocketMQ | 5.3.0 | Event bus for UMCA gates, SSE fan-out | Requires dashboard 2.1.0, orchestrator client credentials |
| RocketMQ Dashboard | 2.1.0 | Operational console, metrics & consumer monitoring | Connects to RocketMQ nameserver |
| Phoenix Evaluator (HTTP) | 1.15+ SaaS | Automated plan/RAG/eval scoring powering UMCA G1-G3 | Externally hosted SaaS; reachable via orchestrator with API key |
| OpenTelemetry / OpenLLMetry collector | otel/opentelemetry-collector-contrib 0.103+ | Unified tracing & metrics (UMCA spans) | Accepts OTLP from orchestrator, exports to backend (Honeycomb/Tempo) |

## Runtime & Execution Plane

| Component | Target Version(s) | Purpose | Dependencies |
| --- | --- | --- | --- |
| Wasmtime | 36.0.0 (LTS) | Default code execution sandbox for deterministic workloads | Spin manifest, WASI workload bundle |
| Spin (CLI runtime) | 2.6+ | Local/test harness for WASM workloads with egress policy | Requires Wasmtime 36, OCI registry access for components |
| SpinKube (optional job) | 0.15.x | K8s operator for WASM scheduling in kinD | Depends on kinD cluster, containerd |
| E2B Sandbox API | 2025-08 control plane | Container fallback for non-WASM workloads | Requires API credentials, network egress |
| Kata Containers | 3.19+ | Hardened VM isolation lane for long-running tasks | Requires nested virtualization (only on self-hosted) |

## Storage & Support Services

| Service | Target Version(s) | Purpose | Dependencies |
| --- | --- | --- | --- |
| MinIO | RELEASE.2024-12-16T15-05-08Z | S3-compatible storage for RAGFlow artifacts | Requires persistent volume (ephemeral during CI) |
| MySQL | 8.0.40 | Primary metadata store for RAGFlow | Volume for data durability (tmpfs in CI) |
| Redis | 6.2-alpine | Task queue/cache for Dify | None |
| PostgreSQL | 15-alpine | Primary DB for Dify & Keycloak (separate schemas) | Persistent volume (tmpfs) |
| Certbot/Squid (optional) | Latest stable | Outbound proxy / certificate automation for prod hardening | Only used in production lanes; disabled in CI |

## External Integrations

| Integration | Purpose |
| --- | --- |
| Phoenix Evaluations (Arize) | Quality gating for UMCA G1-G3 |
| OpenLLMetry | LLM-specific telemetry signals |
| VS Code MCP Registry | Enables operator tooling inside Agent Mode |
| GitHub Checks API | Surface file/line diagnostics from workflow |

This document forms the baseline for ops runbooks and informs the Compose/CI automation living alongside it.
