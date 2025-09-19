# Stack A Service Inventory

## Core Platform Services

### 1. Dify (v1.6.0+)
- **Purpose**: AI application orchestration platform with two-way MCP support
- **Dependencies**: PostgreSQL, Redis, NGINX, Weaviate/Qdrant
- **Key Features**: 
  - Two-way MCP (consume MCP tools and expose flows as MCP servers)
  - Workflow orchestration
  - Agent management
  - Tool registry
- **Container**: `langgenius/dify-web:0.6.16`, `langgenius/dify-api:0.6.16`
- **Ports**: 80 (web), 5001 (api)

### 2. RAGFlow (main branch)
- **Purpose**: RAG studio with MCP server capabilities
- **Dependencies**: Elasticsearch, MinIO, MySQL, Redis
- **Key Features**:
  - Document processing and chunking
  - RAG pipeline management
  - MCP server for deep document tools
- **Container**: `infiniflow/ragflow:v0.15.0`
- **Ports**: 9380 (web)

### 3. Milvus (v2.6.0)
- **Purpose**: Vector database for embeddings and similarity search
- **Dependencies**: etcd, MinIO, Pulsar/RocksMQ
- **Key Features**:
  - Standalone deployment mode
  - High-performance vector operations
  - Multi-tenant support
- **Container**: `milvusdb/milvus:v2.6.0`
- **Ports**: 19530 (grpc), 9091 (http)

### 4. RocketMQ (5.3) + Dashboard (2.1.0)
- **Purpose**: Message queue for event streaming and pub/sub
- **Dependencies**: Java runtime
- **Key Features**:
  - UMCA event streaming
  - SSE fan-out
  - High-throughput messaging
- **Container**: `apache/rocketmq:5.3.0`, `apacherocketmq/rocketmq-dashboard:2.1.0`
- **Ports**: 9876 (nameserver), 10911 (broker), 8080 (dashboard)

### 5. Keycloak (v26.3.2)
- **Purpose**: Identity and access management (OIDC/RBAC)
- **Dependencies**: PostgreSQL (or H2 for dev)
- **Key Features**:
  - OIDC authentication
  - Role-based access control
  - UMCA G0 policy enforcement
- **Container**: `keycloak/keycloak:26.3.2`
- **Ports**: 8080 (web)

## Execution Runtime

### 6. Wasmtime (36.0.0 LTS)
- **Purpose**: WASM runtime for secure code execution
- **Dependencies**: None (standalone)
- **Key Features**:
  - LTS support (24-month lifecycle)
  - Security sandboxing
  - Fast cold starts
- **Binary**: Direct installation or container
- **Integration**: Via SpinKube on Kubernetes

### 7. SpinKube
- **Purpose**: Kubernetes operator for WASM applications
- **Dependencies**: Kubernetes, containerd-shim-spin
- **Key Features**:
  - WASM-first execution
  - Strict egress policies
  - Auto-scaling
- **Components**: spin-operator, containerd-shim-spin-v2
- **Ports**: Variable (per SpinApp)

## Orchestration Layer

### 8. Hono Orchestrator
- **Purpose**: HTTP server with AgentScope integration
- **Dependencies**: Node.js, AgentScope
- **Key Features**:
  - Runtime selection (WASM vs container)
  - SSE event streaming
  - OIDC integration
- **Framework**: Hono.js with AgentScope
- **Ports**: 3000 (http)

### 9. AgentScope
- **Purpose**: Multi-agent orchestration framework
- **Dependencies**: Python runtime or Node.js bindings
- **Key Features**:
  - Agent coordination
  - Conversation management
  - Multi-modal support
- **Source**: Alibaba DAMO Academy
- **Integration**: Via orchestrator server

## Version Compatibility Matrix

| Service | Version | GitHub Runner Compatible | Notes |
|---------|---------|-------------------------|-------|
| Dify | v1.6.0+ | ✅ | Via Docker Compose |
| RAGFlow | main | ✅ | Lightweight deployment |
| Milvus | v2.6.0 | ✅ | Standalone mode |
| RocketMQ | 5.3 | ✅ | In-memory mode for CI |
| Keycloak | 26.3.2 | ✅ | Dev mode with H2 |
| Wasmtime | 36.0.0 | ✅ | Binary or container |
| SpinKube | latest | ⚠️ | Requires K8s (kinD for CI) |
| Hono | latest | ✅ | Node.js application |
| AgentScope | latest | ✅ | Python/Node.js |

## Resource Requirements

### Minimal CI Configuration
- **CPU**: 4 cores (GitHub ubuntu-latest)
- **Memory**: 16GB available
- **Storage**: 14GB SSD
- **Network**: Standard GitHub runner connectivity

### Production Configuration
- **CPU**: 8+ cores recommended
- **Memory**: 32GB+ for full stack
- **Storage**: 100GB+ with persistent volumes
- **Network**: High-bandwidth for model operations