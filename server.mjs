import express from 'express';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';

import demoRequestHandler from './api/demo-request.js';
import approveDemoHandler from './api/approve-demo.js';
import webnotiEventHandler from './api/webnoti/event.js';
import createCheckoutSessionHandler from './api/create-checkout-session.js';
import getCheckoutSessionHandler from './api/get-checkout-session.js';
import claimCheckoutSessionHandler from './api/claim-checkout-session.js';
import stripeWebhookHandler from './api/stripe-webhook.js';
import sendReceiptEmailHandler from './api/send-receipt-email.js';
import htcInviteHandler from './api/htc-invite.js';
import htcSubmitHandler from './api/htc-submit.js';

import serviceDocumentsCreateHandler from './api/service-documents/create.js';
import serviceDocumentsUpdateHandler from './api/service-documents/update.js';
import serviceDocumentsLinesUpsertHandler from './api/service-documents/lines-upsert.js';
import serviceDocumentsRecalculateHandler from './api/service-documents/recalculate.js';
import serviceDocumentsSendHandler from './api/service-documents/send.js';
import serviceDocumentsGetHandler from './api/service-documents/get.js';
import serviceDocumentsPublicGetHandler from './api/service-documents/public-get.js';
import serviceDocumentsPublicSignHandler from './api/service-documents/public-sign.js';
import serviceDocumentsContractorApplyDefaultHandler from './api/service-documents/contractor-apply-default.js';
import serviceDocumentsContractorSignHandler from './api/service-documents/contractor-sign.js';
import serviceDocumentsSealHandler from './api/service-documents/seal.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1);
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      const existing = process.env[key];
      const shouldOverrideStripe =
        key.startsWith('STRIPE_') &&
        (!existing || !String(existing).trim() || String(existing).trim().startsWith('sksk_'));

      if (!(key in process.env) || shouldOverrideStripe) {
        process.env[key] = val;
      }
    }
  } catch {}
}

const app = express();

app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), (req, res) => stripeWebhookHandler(req, res));

// JSON body parsing for our API handlers
app.use(express.json({ limit: '25mb' }));

// API routes (same signatures as Vercel handlers)
app.all('/api/demo-request', (req, res) => demoRequestHandler(req, res));
app.all('/api/approve-demo', (req, res) => approveDemoHandler(req, res));
app.all('/api/webnoti/event', (req, res) => webnotiEventHandler(req, res));
app.all('/api/create-checkout-session', (req, res) => createCheckoutSessionHandler(req, res));
app.all('/api/get-checkout-session', (req, res) => getCheckoutSessionHandler(req, res));
app.all('/api/claim-checkout-session', (req, res) => claimCheckoutSessionHandler(req, res));
app.all('/api/send-receipt-email', (req, res) => sendReceiptEmailHandler(req, res));
app.all('/api/htc/invite', (req, res) => htcInviteHandler(req, res));
app.all('/api/htc/submit', (req, res) => htcSubmitHandler(req, res));

// Service Documents (MVP)
app.all('/api/service-documents/create', (req, res) => serviceDocumentsCreateHandler(req, res));
app.all('/api/service-documents/update', (req, res) => serviceDocumentsUpdateHandler(req, res));
app.all('/api/service-documents/lines/upsert', (req, res) => serviceDocumentsLinesUpsertHandler(req, res));
app.all('/api/service-documents/recalculate', (req, res) => serviceDocumentsRecalculateHandler(req, res));
app.all('/api/service-documents/send', (req, res) => serviceDocumentsSendHandler(req, res));
app.all('/api/service-documents/get', (req, res) => serviceDocumentsGetHandler(req, res));
app.all('/api/service-documents/public/get', (req, res) => serviceDocumentsPublicGetHandler(req, res));
app.all('/api/service-documents/public/sign', (req, res) => serviceDocumentsPublicSignHandler(req, res));
app.all('/api/service-documents/contractor/apply-default', (req, res) => serviceDocumentsContractorApplyDefaultHandler(req, res));
app.all('/api/service-documents/contractor/sign', (req, res) => serviceDocumentsContractorSignHandler(req, res));
app.all('/api/service-documents/seal', (req, res) => serviceDocumentsSealHandler(req, res));

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
