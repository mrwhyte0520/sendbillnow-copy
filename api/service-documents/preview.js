import sealHandler from './seal.js';

export default async function handler(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    req.body = {
      ...body,
      previewOnly: true,
    };
    return await sealHandler(req, res);
  } catch (e) {
    console.error('service-documents/preview failed', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal Server Error' });
  }
}
