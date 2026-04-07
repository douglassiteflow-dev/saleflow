require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ACCESS_CODE = process.env.ACCESS_CODE || '133707';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

// Verify access code
app.post('/api/verify', (req, res) => {
  const { code } = req.body;
  if (code === ACCESS_CODE) {
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, error: 'Felaktig kod' });
});

// Proxy Claude API calls (keeps API key server-side)
app.post('/api/chat', async (req, res) => {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY.includes('XXXXXX')) {
    return res.status(500).json({ error: 'API-nyckel ej konfigurerad på servern.' });
  }

  const { model, max_tokens, system, messages } = req.body;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens, system, messages }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Offertsystem kör på http://localhost:${PORT}`);
});
