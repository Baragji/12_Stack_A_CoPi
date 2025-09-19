import { strict as assert } from 'node:assert';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { Producer, SimpleConsumer } from 'rocketmq-client-nodejs';
import { execa } from 'execa';

type SmokeResult = {
  component: string;
  status: 'pass' | 'fail';
  duration_ms: number;
  detail: string;
};

type Recorder = (component: string, run: () => Promise<string | void>) => Promise<void>;

type ArgMap = Record<string, string>;

const args: ArgMap = process.argv.slice(2).reduce<ArgMap>((acc, cur, idx, all) => {
  if (!cur.startsWith('--')) {
    return acc;
  }
  const key = cur.slice(2);
  const value = all[idx + 1]?.startsWith('--') || all[idx + 1] === undefined ? 'true' : all[idx + 1];
  return { ...acc, [key]: value };
}, {});

const orchestratorUrl = process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:8787';
const difyUrl = process.env.DIFY_URL ?? 'http://127.0.0.1:5001';
const ragflowUrl = process.env.RAGFLOW_URL ?? 'http://127.0.0.1:8085';
const keycloakUrl = process.env.KEYCLOAK_URL ?? 'http://127.0.0.1:8081';
const rocketmqEndpoint = process.env.ROCKETMQ_ENDPOINT ?? '127.0.0.1:9876';
const smokeTopic = process.env.UMCA_TOPIC ?? 'umca-events';

let bearerToken = args['token'] ?? process.env.ORCHESTRATOR_TOKEN ?? '';
const results: SmokeResult[] = [];
const failures: string[] = [];

function logResult(result: SmokeResult) {
  const detail = result.detail.replace(/\s+/g, ' ').trim();
  console.log(
    `SMOKE RESULT component=${result.component} status=${result.status} duration_ms=${Math.round(
      result.duration_ms,
    )} detail=${detail}`,
  );
}

const record: Recorder = async (component, run) => {
  const start = performance.now();
  try {
    const detail = (await run()) ?? '';
    const duration = performance.now() - start;
    const result: SmokeResult = { component, status: 'pass', duration_ms: duration, detail };
    results.push(result);
    logResult(result);
  } catch (error) {
    const duration = performance.now() - start;
    const detail = error instanceof Error ? error.message : String(error);
    const result: SmokeResult = { component, status: 'fail', duration_ms: duration, detail };
    results.push(result);
    failures.push(`${component}: ${detail}`);
    logResult(result);
  }
};

async function expectOk(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    assert(response.ok, `${url} responded with ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

await record('dify-health', async () => {
  await expectOk(`${difyUrl}/health`);
  return '200 OK';
});

await record('ragflow-health', async () => {
  const res = await expectOk(`${ragflowUrl}/api/health`);
  const body = await res.json();
  return body.status ?? 'ok';
});

await record('orchestrator-health', async () => {
  const res = await expectOk(`${orchestratorUrl}/healthz`);
  const json = await res.json();
  assert.equal(json.status, 'ok');
  return 'healthy';
});

await record('keycloak-token', async () => {
  const params = new URLSearchParams({
    client_id: 'orchestrator-ci',
    client_secret: 'orchestrator-secret',
    grant_type: 'password',
    username: 'smoke-user',
    password: 'Passw0rd!',
  });
  const res = await expectOk(`${keycloakUrl}/realms/umca-dev/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const json = await res.json();
  assert.ok(json.access_token, 'missing access token');
  bearerToken = json.access_token;
  return 'retrieved access token';
});

await record('keycloak-protected', async () => {
  assert.ok(bearerToken, 'token unavailable');
  const res = await expectOk(`${orchestratorUrl}/protected/ping`, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  const body = await res.json();
  assert.equal(body.ok, true);
  return `user=${body.user}`;
});

await record('orchestrator-run', async () => {
  assert.ok(bearerToken, 'token unavailable');
  const res = await expectOk(`${orchestratorUrl}/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ spec: { task: 'ci smoke validation', details: 'verify stack' } }),
  });
  const payload = await res.json();
  assert.ok(payload.plan?.steps?.length >= 1, 'plan missing steps');
  assert.ok(Array.isArray(payload.executionResults), 'execution results missing');
  return `plan=${payload.plan.steps.length} tasks`;
});

await record('sse-stream', async () => {
  assert.ok(bearerToken, 'token unavailable');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  const response = await fetch(`${orchestratorUrl}/stream`, {
    headers: { Authorization: `Bearer ${bearerToken}` },
    signal: controller.signal,
  });
  assert(response.ok, `/stream responded with ${response.status}`);
  const reader = response.body?.getReader();
  assert(reader, 'missing readable stream');
  const decoder = new TextDecoder();
  const events: string[] = [];
  let buffer = '';
  try {
    while (events.length < 2) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf('\n\n');
      while (index !== -1) {
        const chunk = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const dataLine = chunk.split('\n').find((line) => line.startsWith('data:'));
        if (dataLine) {
          events.push(dataLine.replace(/^data:\s*/, ''));
        }
        index = buffer.indexOf('\n\n');
      }
    }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      throw error;
    }
  }
  clearTimeout(timeoutId);
  controller.abort();
  assert(events.length >= 2, `expected 2 SSE events, received ${events.length}`);
  return `events=${events.length}`;
});

await record('rocketmq-roundtrip', async () => {
  const producer = new Producer({
    endpoints: rocketmqEndpoint,
    namespace: 'stack-a',
    topics: [smokeTopic],
  });
  await producer.startup();
  const consumer = new SimpleConsumer({
    consumerGroup: 'stack-a-ci-smoke',
    endpoints: rocketmqEndpoint,
    awaitDuration: 3000,
    namespace: 'stack-a',
    subscriptions: new Map([[smokeTopic, '*']]),
  });
  await consumer.startup();
  const messageBody = JSON.stringify({ ping: 'stack-a', at: new Date().toISOString() });
  await producer.send({
    topic: smokeTopic,
    tag: 'ci-smoke',
    body: Buffer.from(messageBody, 'utf8'),
    properties: new Map([['event-type', 'ci-smoke']]),
  });
  const start = Date.now();
  let received = '';
  while (!received && Date.now() - start < 10_000) {
    const messages = await consumer.receive(1);
    if (messages.length) {
      received = messages[0].body?.toString('utf8') ?? '';
      await consumer.ack(messages[0]);
    }
    if (!received) {
      await sleep(250);
    }
  }
  await producer.shutdown();
  await consumer.shutdown();
  assert.ok(received, 'no message received from RocketMQ');
  assert.equal(received, messageBody);
  return 'round-trip succeeded';
});

await record('milvus-vector', async () => {
  const script = `
import sys

try:
    from pymilvus import (Collection, CollectionSchema, FieldSchema, DataType, connections, utility)
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pymilvus==2.4.4'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    from pymilvus import (Collection, CollectionSchema, FieldSchema, DataType, connections, utility)

connections.connect(host='127.0.0.1', port='19530')
collection_name = 'ci_smoke_vectors'
if utility.has_collection(collection_name):
    utility.drop_collection(collection_name)
fields = [
    FieldSchema(name='id', dtype=DataType.INT64, is_primary=True, auto_id=False),
    FieldSchema(name='embedding', dtype=DataType.FLOAT_VECTOR, dim=4)
]
schema = CollectionSchema(fields)
collection = Collection(collection_name, schema)
collection.insert([[1], [[0.1, 0.2, 0.3, 0.4]]])
collection.load()
search_params = {
    'metric_type': 'L2',
    'params': {'nprobe': 1}
}
search_res = collection.search([[0.1, 0.2, 0.3, 0.4]], 'embedding', search_params, limit=1, output_fields=['id'])
if len(search_res) == 0 or len(search_res[0]) == 0:
    raise SystemExit('no hits returned')
print('hit', search_res[0][0].id)
`;
  const { stdout } = await execa('python3', ['-c', script]);
  return stdout.trim();
});

const reportPath = new URL('../tests/smoke-report.json', import.meta.url);
writeFileSync(reportPath, JSON.stringify(results, null, 2));

if (failures.length) {
  throw new Error(`Smoke failures: ${failures.join('; ')}`);
}
