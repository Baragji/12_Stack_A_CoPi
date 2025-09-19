# GitHub Runner Compatibility Analysis

## Executive Summary

Stack A services are designed to run efficiently on GitHub-hosted runners with minimal resource overhead. The WASM-first approach significantly reduces the computational footprint while maintaining production-grade functionality.

## GitHub Runner Specifications

### Standard ubuntu-latest Runner
- **CPU**: 4 cores (x86_64)
- **Memory**: 16 GB RAM
- **Storage**: 14 GB SSD available
- **Network**: Standard connectivity with egress restrictions
- **Container Runtime**: Docker 24.0+
- **Time Limit**: 6 hours maximum

## Service-by-Service Analysis

### ✅ Fully Compatible (Ephemeral Services)

#### 1. Dify (v1.6.0+)
- **Resource Usage**: ~2GB RAM, 1 CPU core
- **Deployment**: Docker Compose with embedded dependencies
- **Startup Time**: 30-60 seconds
- **CI Strategy**: Use lightweight configuration with H2/SQLite
- **Advantages**: 
  - Well-optimized containers
  - Configurable resource limits
  - Fast initialization in dev mode

#### 2. RAGFlow
- **Resource Usage**: ~1.5GB RAM, 1 CPU core
- **Deployment**: Single container with embedded Elasticsearch
- **Startup Time**: 45-90 seconds
- **CI Strategy**: Minimal document corpus for testing
- **Advantages**:
  - Lightweight deployment mode available
  - In-memory operations for CI

#### 3. Milvus (v2.6.0 Standalone)
- **Resource Usage**: ~1GB RAM, 0.5 CPU core
- **Deployment**: Single container with embedded etcd/MinIO
- **Startup Time**: 20-30 seconds
- **CI Strategy**: In-memory mode with small datasets
- **Advantages**:
  - Standalone mode eliminates external dependencies
  - Configurable memory limits
  - Fast vector operations

#### 4. RocketMQ + Dashboard
- **Resource Usage**: ~800MB RAM, 0.5 CPU core
- **Deployment**: Two containers (nameserver + broker)
- **Startup Time**: 15-30 seconds
- **CI Strategy**: In-memory storage, no persistence
- **Advantages**:
  - Lightweight for development
  - Fast message processing
  - Built-in dashboard for monitoring

#### 5. Keycloak (v26.3.2)
- **Resource Usage**: ~1GB RAM, 0.5 CPU core
- **Deployment**: Single container with H2 database
- **Startup Time**: 30-45 seconds
- **CI Strategy**: Dev mode with in-memory database
- **Advantages**:
  - Dev mode optimizations
  - Pre-configured realms
  - Fast OIDC operations

#### 6. Hono Orchestrator
- **Resource Usage**: ~200MB RAM, 0.25 CPU core
- **Deployment**: Node.js application
- **Startup Time**: 5-10 seconds
- **CI Strategy**: Direct execution with npm
- **Advantages**:
  - Minimal resource footprint
  - Fast startup
  - Native GitHub Actions integration

#### 7. Wasmtime (36.0.0)
- **Resource Usage**: ~50MB RAM, 0.1 CPU core baseline
- **Deployment**: Binary installation or container
- **Startup Time**: <1 second
- **CI Strategy**: Direct binary installation
- **Advantages**:
  - Extremely lightweight
  - Near-instant cold starts
  - Security isolation

### ⚠️ Conditional Compatibility (Second Job)

#### 8. SpinKube (Kubernetes Components)
- **Resource Usage**: ~2GB RAM, 1 CPU core (for kinD cluster)
- **Deployment**: Requires Kubernetes cluster
- **Startup Time**: 2-3 minutes (cluster + operator)
- **CI Strategy**: Use kinD (Kubernetes in Docker)
- **Considerations**:
  - Separate job from ephemeral services
  - Optional execution based on trigger
  - Full K8s stack overhead

## Resource Budget Analysis

### Total Resource Usage (Ephemeral Stack)
```
Component           CPU     RAM     Storage  Startup
Dify               1.0     2048MB    500MB    60s
RAGFlow            1.0     1536MB    300MB    90s
Milvus             0.5     1024MB    200MB    30s
RocketMQ           0.5      512MB    100MB    30s
Keycloak           0.5     1024MB    150MB    45s
Orchestrator       0.25     200MB     50MB    10s
Wasmtime           0.1       50MB     20MB     1s
─────────────────────────────────────────────────
TOTAL              3.85    6394MB   1320MB   266s
```

### GitHub Runner Capacity
```
Available          CPU     RAM      Storage
GitHub Runner      4.0    16384MB   14336MB
Usage              96%      39%       9%
Margin             0.15    9990MB   13016MB
```

**Verdict**: ✅ Comfortably within limits with substantial headroom

## Optimization Strategies

### 1. Sequential Service Startup
```yaml
- name: Start core services
  run: |
    docker compose up -d milvus keycloak
    sleep 30
    docker compose up -d rocketmq
    sleep 15
    docker compose up -d dify ragflow
```

### 2. Resource Limits
```yaml
services:
  dify:
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
        reservations:
          memory: 1G
          cpus: '0.5'
```

### 3. Health Checks
```yaml
- name: Wait for services
  run: |
    timeout 300 bash -c 'until curl -f http://localhost:3000/health; do sleep 5; done'
    timeout 300 bash -c 'until curl -f http://localhost:9380/health; do sleep 5; done'
```

## CI/CD Strategy

### Primary Job (Always Run)
- All ephemeral services
- Basic smoke tests
- WASM execution path
- API connectivity tests

### Secondary Job (Optional)
- Kubernetes validation
- Full container fallback
- Performance benchmarks
- End-to-end workflows

## Performance Expectations

### Startup Times
- **Fastest Path**: WASM-only (~2 minutes total)
- **Standard Path**: All ephemeral services (~5 minutes)
- **Full Path**: Including K8s validation (~8 minutes)

### Success Criteria
- All services start within allocated timeouts
- Health checks pass within 5 minutes
- Smoke tests complete within 10 minutes
- Total job time under 15 minutes

## Recommendations

1. **Use sequential startup** to avoid resource contention
2. **Implement comprehensive health checks** for reliability
3. **Keep test datasets minimal** to reduce memory usage
4. **Use separate jobs** for heavy validation scenarios
5. **Monitor resource usage** and adjust limits as needed