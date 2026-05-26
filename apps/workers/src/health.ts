import { createServer, type Server } from 'node:http';

export interface HealthPayload {
  status: 'ok';
  service: 'workers';
  timestamp: string;
}

export function buildHealthPayload(): HealthPayload {
  return {
    status: 'ok',
    service: 'workers',
    timestamp: new Date().toISOString(),
  };
}

export function createHealthServer(): Server {
  return createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(buildHealthPayload()));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'NotFound' }));
  });
}
