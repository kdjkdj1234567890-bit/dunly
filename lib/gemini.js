// Free-tier quotas are per model, so fall back to lighter models when one is rate limited.
const MODELS = (process.env.GEMINI_MODEL || 'gemini-2.5-flash,gemini-flash-latest,gemini-flash-lite-latest,gemini-3.1-flash-lite').split(',');

async function gemini({ system, prompt, schema, temperature = 0.2 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('AI key is not configured');
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema, thinkingConfig: { thinkingBudget: 0 } }
  };
  let last;
  for (let i = 0; i < MODELS.length + 1; i++) {
    const MODEL = MODELS[Math.min(i, MODELS.length - 1)];
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body)
    });
    if (r.status === 429 || r.status >= 500) { last = 'AI service busy (' + r.status + ')'; await new Promise(s => setTimeout(s, 700 * (i + 1))); continue; }
    const j = await r.json();
    if (!r.ok) { last = 'AI error: ' + ((j.error && j.error.message) || r.status).toString().slice(0, 160); continue; }
    const txt = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts.map(p => p.text || '').join('');
    if (!txt) throw new Error('AI returned no content');
    return JSON.parse(txt);
  }
  throw new Error(last || 'AI unavailable');
}
module.exports = { gemini };
