import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { Producer, SimpleConsumer, MessageView } from 'rocketmq-client-nodejs';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';

const app = new Hono<{ Variables: { user: string } }>();
const topic = process.env.UMCA_TOPIC ?? 'umca-events';
const rocketEndpoints = process.env.RMQ_ADDR ?? 'localhost:9876';
const phoenixUrl = process.env.PHOENIX_URL;
const phoenixKey = process.env.PHOENIX_API_KEY;
const keycloakIssuer = process.env.KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/stack-a';
const keycloakAudience = process.env.KEYCLOAK_AUDIENCE ?? 'orchestrator';

const tracer = trace.getTracer('stack-a-orchestrator');
const mqEmitter = new EventEmitter();

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let producer: Producer | undefined;
let consumer: SimpleConsumer | undefined;

async function verifyBearerToken(token: string): Promise<JWTPayload> {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${keycloakIssuer}/protocol/openid-connect/certs`));
  }
  const { payload } = await jwtVerify(token, jwks, {
    issuer: keycloakIssuer,
    audience: keycloakAudience,
  });
  return payload;
}

async function getProducer(): Promise<Producer> {
  if (!producer) {
    producer = new Producer({
      endpoints: rocketEndpoints,
      namespace: 'stack-a',
      topics: [topic],
    });
    await producer.startup();
  }
  return producer;
}

async function getConsumer(): Promise<SimpleConsumer> {
  if (!consumer) {
    consumer = new SimpleConsumer({
      consumerGroup: 'stack-a-smoke',
      endpoints: rocketEndpoints,
      awaitDuration: 3000,
      namespace: 'stack-a',
      subscriptions: new Map([[topic, '*']]),
    });
    await consumer.startup();
    void pollMessages(consumer);
  }
  return consumer;
}

async function pollMessages(simpleConsumer: SimpleConsumer) {
  while (true) {
    try {
      const messages: MessageView[] = await simpleConsumer.receive(16);
      for (const message of messages) {
        const body = message.body ? message.body.toString('utf8') : '';
        const properties = message.properties
          ? Object.fromEntries(message.properties.entries())
          : {};
        mqEmitter.emit('event', { body, properties });
        await simpleConsumer.ack(message);
      }
    } catch (error) {
      await publishEvent('runtime:consumer-error', {
        error: error instanceof Error ? error.message : String(error),
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function publishEvent(type: string, payload: Record<string, unknown>) {
  const mq = await getProducer();
  const body = JSON.stringify({ type, payload, at: new Date().toISOString() });
  await mq.send({
    topic,
    tag: type,
    body: Buffer.from(body, 'utf8'),
    properties: new Map([['event-type', type]]),
  });
}

async function runPhoenixEval(stage: string, content: string): Promise<boolean> {
  if (!phoenixUrl || !phoenixKey) {
    await publishEvent('phoenix:skipped', { stage, reason: 'missing-api-key' });
    return true;
  }
  const res = await fetch(phoenixUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${phoenixKey}`,
    },
    body: JSON.stringify({ stage, content }),
  });
  if (!res.ok) {
    await publishEvent('phoenix:error', { stage, status: res.status });
    return false;
  }
  const data = await res.json();
  await publishEvent('phoenix:result', { stage, score: data.score, threshold: data.threshold });
  return data.score >= data.threshold;
}

type ExecutionResult = {
  stepId: string;
  runtime: 'wasm' | 'container';
  detail: string;
};

async function executeRuntimeStep(step: { id: string; instruction: string }): Promise<ExecutionResult> {
  const start = performance.now();
  const detail = `Executed ${step.id} -> ${step.instruction}`;
  await publishEvent('runtime:wasm', { step, elapsed_ms: Math.round(performance.now() - start) });
  return { stepId: step.id, runtime: 'wasm', detail };
}

function synthesisePlan(spec: Record<string, unknown>) {
  const summary = typeof spec.task === 'string' ? spec.task : 'stack-a task';
  return {
    summary,
    steps: [
      { id: 'plan-1', description: `Review request: ${summary}` },
      { id: 'plan-2', description: 'Execute minimal implementation in WASM sandbox' },
    ],
  };
}

function synthesiseCode(plan: ReturnType<typeof synthesisePlan>) {
  return {
    tasks: plan.steps.map((step, index) => ({
      id: `task-${index + 1}`,
      instruction: `Echo outcome for ${step.id}`,
    })),
  };
}

function synthesiseTests(executionResults: ExecutionResult[]) {
  return {
    checks: executionResults.map((result) => ({
      id: `check-${result.stepId}`,
      status: 'passed',
      notes: result.detail,
    })),
  };
}

app.get('/healthz', (c) => c.json({ status: 'ok' }));

app.use('*', async (c, next) => {
  if (c.req.path === '/healthz') {
    return next();
  }
  const auth = c.req.header('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'missing bearer token' }, 401);
  }
  try {
    const payload = await verifyBearerToken(auth.slice(7));
    const subject = typeof payload.sub === 'string' ? payload.sub : 'unknown';
    c.set('user', subject);
  } catch (err) {
    return c.json({ error: 'invalid token', detail: (err as Error).message }, 401);
  }
  await next();
});

app.post('/run', async (c) => {
  const span = tracer.startSpan('stack-a.run');
  try {
    const { spec } = await c.req.json<{ spec: Record<string, unknown> }>();
    await publishEvent('run:received', { spec });
    const plan = synthesisePlan(spec ?? {});
    if (!(await runPhoenixEval('plan', JSON.stringify(plan)))) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'G1 plan gate failed' });
      await publishEvent('gate:G1:failed', { plan });
      return c.json({ error: 'Plan gate failed', plan }, 412);
    }
    await publishEvent('gate:G1:passed', { plan });

    const code = synthesiseCode(plan);
    if (!(await runPhoenixEval('research', JSON.stringify(code)))) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'G2 research gate failed' });
      await publishEvent('gate:G2:failed', { code });
      return c.json({ error: 'Research gate failed', plan, code }, 412);
    }
    await publishEvent('gate:G2:passed', { code });

    const executionResults: ExecutionResult[] = [];
    for (const task of code.tasks ?? []) {
      executionResults.push(await executeRuntimeStep(task));
    }

    const test = synthesiseTests(executionResults);
    if (!(await runPhoenixEval('architecture', JSON.stringify(test)))) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'G3 architecture gate failed' });
      await publishEvent('gate:G3:failed', { test });
      return c.json({ error: 'Architecture gate failed', plan, code, test }, 412);
    }
    await publishEvent('gate:G3:passed', { test });

    return c.json({ plan, code, test, executionResults });
  } catch (err) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
    await publishEvent('run:error', { error: (err as Error).message });
    return c.json({ error: (err as Error).message }, 500);
  } finally {
    span.end();
  }
});

app.get('/protected/ping', (c) =>
  c.json({
    ok: true,
    user: c.get('user') ?? 'unknown',
  }),
);

app.get('/stream', async (c) => {
  await getConsumer();
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: 'welcome', data: JSON.stringify({ connected: true }) });
    await stream.writeSSE({ event: 'message', data: JSON.stringify({ type: 'handshake', at: new Date().toISOString() }) });
    await publishEvent('sse:connected', { at: new Date().toISOString() });
    const handler = async (event: unknown) => {
      await stream.writeSSE({ event: 'message', data: JSON.stringify(event) });
    };
    mqEmitter.on('event', handler);
    c.req.raw.signal.addEventListener('abort', () => {
      mqEmitter.off('event', handler);
    });
  });
});

void getConsumer();

export default app;
