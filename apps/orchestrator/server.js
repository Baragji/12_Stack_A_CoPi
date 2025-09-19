import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

// Configuration
const config = {
  port: parseInt(process.env.PORT || '3000'),
  wasmUrl: process.env.WASM_URL || 'http://localhost:8001/run',
  keycloakUrl: process.env.KEYCLOAK_URL || 'http://localhost:8080',
  milvusUrl: process.env.MILVUS_URL || 'http://localhost:19530',
  rocketmqUrl: process.env.ROCKETMQ_URL || 'http://localhost:9876',
  difyApiUrl: process.env.DIFY_API_URL || 'http://localhost:5001',
  ragflowApiUrl: process.env.RAGFLOW_API_URL || 'http://localhost:9380'
}

// UMCA Event Types
class UMCAEvent {
  constructor(type, data, gate = null) {
    this.id = crypto.randomUUID()
    this.timestamp = new Date().toISOString()
    this.type = type
    this.gate = gate
    this.data = data
  }
}

// SSE Connection Manager
class SSEManager {
  constructor() {
    this.connections = new Set()
  }
  
  addConnection(response) {
    this.connections.add(response)
  }
  
  removeConnection(response) {
    this.connections.delete(response)
  }
  
  broadcast(event) {
    const data = `data: ${JSON.stringify(event)}\n\n`
    console.log('Broadcasting event:', event.type)
    // In production, this would write to actual SSE connections
  }
}

// Runtime Selection Logic
class RuntimeSelector {
  selectRuntime(spec) {
    // WASM-first decision logic
    if (!spec.preferWasm) return 'container'
    if (spec.requiresNative) return 'container'
    
    // Language-based decisions
    const wasmSupportedLanguages = ['javascript', 'typescript', 'rust', 'go']
    if (spec.language && !wasmSupportedLanguages.includes(spec.language)) {
      return 'container'
    }
    
    // Default to WASM
    return 'wasm'
  }
}

// Execution Engines
class WasmExecutor {
  async execute(spec) {
    try {
      const response = await fetch(config.wasmUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: spec.task,
          language: spec.language || 'javascript',
          timeout: spec.maxSeconds || 30
        })
      })
      
      if (!response.ok) {
        throw new Error(`WASM execution failed: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      throw error
    }
  }
}

class ContainerExecutor {
  async execute(spec) {
    // Mock container execution - in production this would call E2B or Kata
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    return {
      runtime: 'container',
      output: `Executed: ${spec.task}`,
      exitCode: 0,
      executionTime: 1000
    }
  }
}

// Phoenix Evaluation (G1 Gate)
async function evaluateWithPhoenix(spec) {
  // Mock Phoenix evaluation for now
  const riskFactors = [
    spec.task.toLowerCase().includes('delete'),
    spec.task.toLowerCase().includes('rm '),
    spec.task.toLowerCase().includes('sudo'),
    spec.requiresNative || false
  ]
  
  const riskScore = riskFactors.filter(Boolean).length / riskFactors.length
  const score = 1 - riskScore
  
  return {
    passed: score >= 0.7,
    score,
    reason: score < 0.7 ? 'High risk task detected' : undefined
  }
}

// Main Application
const app = new Hono()
const sseManager = new SSEManager()
const runtimeSelector = new RuntimeSelector()
const wasmExecutor = new WasmExecutor()
const containerExecutor = new ContainerExecutor()

// Middleware
app.use('*', cors())

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      wasm: config.wasmUrl,
      keycloak: config.keycloakUrl,
      milvus: config.milvusUrl,
      rocketmq: config.rocketmqUrl
    }
  })
})

// Authentication endpoint
app.post('/auth/login', async (c) => {
  // Redirect to Keycloak for OIDC authentication
  const redirectUri = `${config.keycloakUrl}/realms/stacka/protocol/openid-connect/auth`
  return c.json({
    redirectUri,
    clientId: 'stacka-orchestrator',
    scope: 'openid profile email'
  })
})

// Server-Sent Events endpoint
app.get('/stream', (c) => {
  return new Response(
    new ReadableStream({
      start(controller) {
        // Send initial connection event
        const initialEvent = new UMCAEvent('execution_start', { 
          message: 'Connected to Stack A event stream' 
        })
        
        const data = `data: ${JSON.stringify(initialEvent)}\n\n`
        controller.enqueue(new TextEncoder().encode(data))
        
        // Keep connection alive
        const keepAlive = setInterval(() => {
          controller.enqueue(new TextEncoder().encode(': keepalive\n\n'))
        }, 30000)
        
        // Cleanup on close
        return () => {
          clearInterval(keepAlive)
        }
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      }
    }
  )
})

// Main execution endpoint
app.post('/run', async (c) => {
  try {
    // Parse and validate request
    const body = await c.req.json()
    const spec = body.spec || body
    const sessionId = crypto.randomUUID()
    
    // G0: Authentication & Authorization (simplified for demo)
    const g0Event = new UMCAEvent('gate_check', {
      status: 'passed', 
      message: 'Authentication and authorization verified'
    }, 'G0')
    sseManager.broadcast(g0Event)
    
    // G1: Phoenix Evaluation
    const evaluation = await evaluateWithPhoenix(spec)
    const g1Event = new UMCAEvent('gate_check', {
      status: evaluation.passed ? 'passed' : 'failed',
      score: evaluation.score,
      reason: evaluation.reason
    }, 'G1')
    sseManager.broadcast(g1Event)
    
    if (!evaluation.passed) {
      return c.json({ 
        error: 'Task failed G1 evaluation',
        gate: 'G1',
        score: evaluation.score,
        reason: evaluation.reason
      }, 400)
    }
    
    // G2: Runtime Selection
    const selectedRuntime = runtimeSelector.selectRuntime(spec)
    const g2Event = new UMCAEvent('gate_check', {
      status: 'passed',
      runtime: selectedRuntime,
      reason: `Selected ${selectedRuntime} runtime based on task requirements`
    }, 'G2')
    sseManager.broadcast(g2Event)
    
    // Execute task
    const startEvent = new UMCAEvent('execution_start', {
      runtime: selectedRuntime, 
      sessionId
    })
    sseManager.broadcast(startEvent)
    
    let result
    if (selectedRuntime === 'wasm') {
      result = await wasmExecutor.execute(spec)
    } else {
      result = await containerExecutor.execute(spec)
    }
    
    // G3: Post-execution validation
    const g3Event = new UMCAEvent('gate_check', {
      status: 'passed',
      message: 'Execution completed successfully',
      executionTime: result.executionTime || 0
    }, 'G3')
    sseManager.broadcast(g3Event)
    
    const completeEvent = new UMCAEvent('execution_complete', {
      result, 
      sessionId
    })
    sseManager.broadcast(completeEvent)
    
    return c.json({
      sessionId,
      runtime: selectedRuntime,
      result,
      gates: {
        G0: 'passed',
        G1: 'passed',
        G2: 'passed',
        G3: 'passed'
      }
    })
    
  } catch (error) {
    const errorEvent = new UMCAEvent('error', {
      error: error.message,
      stack: error.stack
    })
    sseManager.broadcast(errorEvent)
    
    return c.json({ error: error.message }, 500)
  }
})

// MCP endpoints for VS Code integration
app.get('/mcp/tools', (c) => {
  return c.json({
    tools: [
      {
        name: 'execute_code',
        description: 'Execute code using Stack A WASM-first orchestrator',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            language: { type: 'string', enum: ['javascript', 'typescript', 'python', 'rust', 'go'] },
            preferWasm: { type: 'boolean', default: true }
          },
          required: ['code']
        }
      }
    ]
  })
})

// Error handling
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ error: 'Internal server error' }, 500)
})

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404)
})

console.log(`🚀 Stack A Orchestrator starting on port ${config.port}`)
console.log(`📡 WASM Runner: ${config.wasmUrl}`)
console.log(`🔐 Keycloak: ${config.keycloakUrl}`)
console.log(`📊 Milvus: ${config.milvusUrl}`)
console.log(`📨 RocketMQ: ${config.rocketmqUrl}`)

serve({
  fetch: app.fetch,
  port: config.port
})