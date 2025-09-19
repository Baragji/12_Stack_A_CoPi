# Stack A: WASM-first Composition Platform

Stack A is a WASM-first code execution and AI orchestration platform that implements the "Sino-Native Composer" architecture with comprehensive security gates and observability.

## 🚀 Quick Start

### Prerequisites

- Docker Engine ≥ 24.0
- Docker Compose ≥ v2.26
- Node.js ≥ 20.0
- 16GB RAM recommended

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd 12_Stack_A_CoPi
   ```

2. **Start the platform services**
   ```bash
   docker compose -f ops/compose/stack.yml up -d
   ```

3. **Start the orchestrator**
   ```bash
   cd apps/orchestrator
   npm install
   npm start
   ```

4. **Open VS Code with MCP integration**
   - Install VS Code MCP extension
   - The `.vscode/mcp.json` configuration will automatically register Stack A tools

## 🏗️ Architecture

### WASM-first Execution Path

```
VS Code Agent → Orchestrator → Runtime Selection
                              ├─ WASM Runner (default)
                              └─ Container (fallback)
```

### Core Components

- **Orchestrator**: Hono-based HTTP server with AgentScope integration
- **WASM Runner**: Spin-based WebAssembly execution environment
- **Platform Services**: Dify, RAGFlow, Milvus, RocketMQ, Keycloak
- **Observability**: OpenTelemetry, Phoenix evaluations, UMCA gates

## 🔒 Security Gates (UMCA)

- **G0**: Authentication & Authorization (Keycloak OIDC)
- **G1**: Phoenix Evaluation (Risk assessment)
- **G2**: Runtime Selection (WASM-first with fallback)
- **G3**: Post-execution Validation

## 📊 Services

| Service | Version | Purpose | Port |
|---------|---------|---------|------|
| Dify | v1.6.0+ | AI orchestration with MCP | 3001 |
| RAGFlow | main | RAG studio with MCP server | 9380 |
| Milvus | v2.6.0 | Vector database | 19530 |
| RocketMQ | 5.3 | Message streaming | 9876 |
| Keycloak | 26.3.2 | Identity management | 8080 |
| Orchestrator | 1.0.0 | WASM-first coordinator | 3000 |

## 🧪 Testing

### Run CI Smoke Tests Locally

```bash
# Start all services
docker compose -f ops/compose/stack.yml up -d

# Run orchestrator
cd apps/orchestrator
npm start

# Test WASM execution path
curl -X POST http://localhost:3000/run \
  -H "Content-Type: application/json" \
  -d '{"spec": {"task": "console.log(\"Hello WASM\")", "language": "javascript"}}'
```

### GitHub Actions

The CI pipeline runs ephemeral services on GitHub runners:

```bash
# Trigger full CI including Kubernetes validation
git commit -m "feat: new feature [full-ci]"
git push
```

## 🛠️ Development

### Version Matrix

Edit `ci/versions.json` to update service versions:

```json
{
  "node": ["20", "22"],
  "milvus": ["v2.6.0"],
  "keycloak": ["26.3.2"]
}
```

### MCP Tools in VS Code

Once services are running, VS Code Agent Mode will show:

- **execute_code**: Run code via Stack A orchestrator
- **create_workflow**: Create Dify AI workflows
- **process_documents**: Process documents via RAGFlow

## 📈 Observability

### Event Streaming

```bash
# Connect to live event stream
curl -N http://localhost:3000/stream
```

### Service Health

```bash
# Check all service health
curl http://localhost:3000/health
```

## 🚀 Production Deployment

### Kubernetes with SpinKube

```bash
# Install SpinKube operator
kubectl apply -f https://github.com/spinkube/spin-operator/releases/latest/download/spin-operator.crds.yaml

# Deploy WASM applications
kubectl apply -f spin/code-runner-wasm/spin.toml
```

### Environment Variables

Key configuration options:

```bash
WASM_URL=http://code-runner-wasm:80/run
KEYCLOAK_URL=http://keycloak:8080
MILVUS_URL=http://milvus:19530
ROCKETMQ_URL=http://rocketmq:9876
```

## 📚 Documentation

- [Service Inventory](docs/stackA/inventory.md) - Complete service list
- [Architecture Diagram](docs/stackA/architecture.mermaid) - System overview
- [Feasibility Analysis](docs/stackA/feasibility.md) - GitHub runner compatibility

## 🤝 Contributing

1. Create feature branch: `git checkout -b feat/your-feature`
2. Update version matrix if needed: `ci/versions.json`
3. Run tests: `npm test`
4. Submit PR with CI validation

## 📄 License

MIT License - see LICENSE file for details.