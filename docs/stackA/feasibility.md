# GitHub Runner Feasibility

This document evaluates how well each Stack A component runs on hosted GitHub Actions runners (Ubuntu 24.04) and documents mitigations for heavier services.

## Runner Baseline

* **Machine**: 4 vCPU, 16 GB RAM, ephemeral SSD.
* **Container Runtime**: Docker Engine 27 with Compose v2, cgroup v2.
* **Limits**: ~14 GB usable RAM before OOM killer, outbound egress unrestricted but rate limited.

## Service Compatibility Matrix

| Service | Runner Compatibility | Notes & Mitigations |
| --- | --- | --- |
| Dify (API/Web/Worker) | ✅ Runs with Compose | Requires ~3 GB RAM including PostgreSQL/Redis. Disable GPU features; mount tmpfs for uploads. Sandboxed execution via `dify-sandbox` container passes on x86_64. |
| RAGFlow + MCP | ⚠️ Borderline | Full stack (ES + vector index) exceeds RAM. CI profile disables Elasticsearch, uses built-in Infinity + MinIO with memory limits. MySQL tuned with `innodb_buffer_pool_size=512M`. |
| Milvus Standalone 2.6.0 | ✅ | Standalone mode with embedded etcd/minio/rocksmq uses ~2.5 GB peak. Configure `MILVUS_MEMORY_LIMIT=4GB`. |
| RocketMQ 5.3 | ✅ | Nameserver + broker fit under 1 GB with GC tuning. Persist data on tmpfs to avoid disk IO overhead. |
| RocketMQ Dashboard 2.1.0 | ✅ | Lightweight (~256 MB). Runs against internal nameserver via Docker network. |
| Keycloak 26.3 (dev) | ⚠️ High memory | Set `JAVA_OPTS_APPEND=-Xms512m -Xmx1024m`. Use dev mode (no DB) or share PostgreSQL if persistence needed. |
| Hono + AgentScope orchestrator | ✅ | Node 20/22 with pnpm install. Use `--max-old-space-size=1024`. |
| Spin (WASM runtime) | ✅ | `fermyon/actions/spin@v2` installs CLI. Wasmtime 36 compiled for x86_64 works. |
| Phoenix/OpenLLMetry (SaaS) | ✅ | HTTP calls only. Mock credentials replaced with secrets in CI. |
| SpinKube + kinD (optional job) | ⚠️ Heavy | kinD cluster with SpinKube CRDs uses ~6 GB RAM. Run in separate job with `ubuntu-latest` and `swap` disabled. Scale down Milvus/RAGFlow to reduce load. |
| E2B/Kata fallback | ❌ Hosted only | Requires paid API (E2B) or nested virtualization (Kata). Provide stub connectors in CI but guard behind secrets; skip when unavailable. |

## Alternative Strategies for Heavy Components

* **Milvus**: Swap to **Qdrant** or **Weaviate** in fallback lane when memory pressure triggers OOM. Provide feature flag in orchestrator.
* **RAGFlow**: For smoke tests, run `ragflow-web` only and stub heavy ingestion via API mocks. For compliance, nightly job runs full stack on self-hosted runner.
* **Keycloak**: If Java heap continues to spike, fall back to `node-oidc-provider` for smoke gating while Keycloak integration tests run weekly.
* **SpinKube**: Keep optional job disabled by default. Self-hosted GPU runners execute full K8s validation; hosted runners log notice and exit gracefully.

## Observability Footprint

* Use GitHub-hosted **otel-collector** sidecar to ensure traces exit the runner quickly.
* Limit log retention by rotating Compose logs to 200 MB per service.
* Register problem matcher and GitHub Checks summary to highlight failing gates without shipping entire log output.

## Secrets & Configuration

* Inject secrets using `env` + GitHub Encrypted Secrets, never bake into repo.
* Use `docker compose --env-file` to map matrix versions to digest-locked images.
* Gate optional features (Phoenix, E2B) via `if: env.PHOENIX_API_KEY != ''` inside workflow.

Hosted runners can execute the complete Stack A smoke stack when memory budgets are respected and heavy services (RAGFlow optional modules, SpinKube job) are scoped to separate phases.
