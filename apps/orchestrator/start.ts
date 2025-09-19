import { serve } from '@hono/node-server';
import app from './server.js';

const port = parseInt(process.env.PORT || '8787', 10);

console.log(`Stack A Orchestrator starting on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});