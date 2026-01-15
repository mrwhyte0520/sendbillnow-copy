import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import demoRequestHandler from './api/demo-request.js';
import approveDemoHandler from './api/approve-demo.js';
import webnotiEventHandler from './api/webnoti/event.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// JSON body parsing for our API handlers
app.use(express.json({ limit: '2mb' }));

// API routes (same signatures as Vercel handlers)
app.all('/api/demo-request', (req, res) => demoRequestHandler(req, res));
app.all('/api/approve-demo', (req, res) => approveDemoHandler(req, res));
app.all('/api/webnoti/event', (req, res) => webnotiEventHandler(req, res));

// Serve static frontend
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Sendbillnow server listening on port ${port}`);
});
