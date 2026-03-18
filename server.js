require('dotenv').config();
const express  = require('express');
const multer   = require('multer');
const axios    = require('axios');
const FormData = require('form-data');
const path     = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── SAVE API KEYS (runtime, no restart needed) ────────────────────
app.post('/api/keys', (req, res) => {
  const { removeBg, claude } = req.body;
  if (removeBg !== undefined) process.env.REMOVE_BG_API_KEY = removeBg;
  if (claude   !== undefined) process.env.ANTHROPIC_API_KEY  = claude;
  res.json({ ok: true, env: {
    removeBg: !!process.env.REMOVE_BG_API_KEY,
    claude:   !!process.env.ANTHROPIC_API_KEY
  }});
});

// ── HEALTH ────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true, env: {
  removeBg: !!process.env.REMOVE_BG_API_KEY,
  claude:   !!process.env.ANTHROPIC_API_KEY,
}}));

// ── REMOVE BG ─────────────────────────────────────────────────────
app.post('/api/remove-bg', upload.single('image'), async (req, res) => {
  const key = process.env.REMOVE_BG_API_KEY;
  if (!key) return res.status(400).json({ error: 'REMOVE_BG_API_KEY não configurada' });
  try {
    const form = new FormData();
    form.append('image_file', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
    form.append('size', 'auto');
    const response = await axios.post('https://api.remove.bg/v1.0/removebg', form, {
      headers: { ...form.getHeaders(), 'X-Api-Key': key },
      responseType: 'arraybuffer',
    });
    res.set('Content-Type', 'image/png');
    res.send(Buffer.from(response.data));
  } catch (err) {
    res.status(500).json({ error: 'Falha ao remover fundo', details: err.response?.data?.toString() || err.message });
  }
});

// ── CAPTION (Claude) ──────────────────────────────────────────────
app.post('/api/caption', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(400).json({ error: 'ANTHROPIC_API_KEY não configurada' });
  const { pregadores, data, tipo, frase } = req.body;
  try {
    const prompt = `Você é copywriter especialista em comunicação evangélica brasileira.
Crie legenda de Instagram para:
- Tipo: ${tipo}
- Pregadores/Líderes: ${pregadores}
- Data: ${data || 'a definir'}
${frase ? `- Tema: "${frase}"` : ''}
Tom: inspirador, peso espiritual, 3-4 parágrafos curtos, máx 160 palavras, 1-2 emojis naturais, última linha = chamada à ação.
Sem hashtags no corpo. Após a legenda escreva HASHTAGS: e liste 8 hashtags evangélicas.
Responda APENAS legenda + HASHTAGS.`;
    const r = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514', max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    }, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }});
    const full  = r.data.content[0].text;
    const parts = full.split('HASHTAGS:');
    res.json({ caption: parts[0].trim(), tags: (parts[1] || '').trim() });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao gerar legenda', details: err.message });
  }
});

// ── WHATSAPP (wa.me link + opcional Evolution API) ─────────────────
app.post('/api/whatsapp', async (req, res) => {
  const { phone, caption, tags } = req.body;
  if (!phone) return res.status(400).json({ error: 'Número de telefone obrigatório' });

  // Limpa número: remove tudo que não é dígito
  const clean = phone.replace(/\D/g, '');
  const text  = encodeURIComponent((caption || '') + '\n\n' + (tags || ''));
  const link  = `https://wa.me/${clean}?text=${text}`;
  res.json({ ok: true, link });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n✅  Church Post Generator rodando em http://localhost:${PORT}\n`));
