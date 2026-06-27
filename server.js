require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

async function callClaude(system, userContent, maxTokens = 3000) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.startsWith('sk-ant-xxx')) {
    throw new Error('ANTHROPIC_API_KEY not set. Copy .env.example → .env and add your key.');
  }

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userContent }]
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `API error ${res.status}`);
  return data.content?.[0]?.text || '';
}

// ─── SEARCH ENDPOINT ────────────────────────────────────────────────
app.post('/api/search', async (req, res) => {
  try {
    const { country, region, level, field, destination, extra, type, gpa } = req.body;

    const system = `You are ScholarPath AI. Return ONLY a valid JSON array of 12–14 real scholarship/internship objects. No markdown, no explanation, no preamble — just the raw JSON array.
Each object must have ALL these fields:
{
  "id": "unique-slug",
  "type": "scholarship|internship|fellowship|research|exchange|training",
  "title": "official program name",
  "organization": "offering institution",
  "country": "host country",
  "funding": "Fully Funded|Partial|Stipend|Unpaid",
  "amount": "e.g. $30,000/year or Full tuition + $1,500/month",
  "deadline": "Month YYYY or Rolling",
  "urgency": "urgent|soon|open",
  "field": "field of study",
  "level": "study level",
  "tags": ["tag1","tag2","tag3"],
  "eligible_countries": "who can apply e.g. Open to all developing countries",
  "gpa": "minimum GPA required e.g. 3.0/4.0 or N/A",
  "language": "English|German|French|etc",
  "duration": "e.g. 2 years or 3 months",
  "benefits": "what is covered — tuition, stipend, housing, flights, etc.",
  "requirements": ["req1","req2","req3","req4","req5"],
  "apply_url": "https://actual-application-page.org",
  "description": "2-sentence summary of the program and its value."
}
Mix scholarship, internship, fellowship, research types. Include programs from USA, UK, Germany, Canada, Australia, Japan, Turkey, China, Netherlands, South Korea, France, Sweden. Use real, well-known programs. If a student GPA is provided, only return opportunities where the minimum GPA requirement is at or below the student's GPA.`;

    let parts = ['Find global academic opportunities'];
    if (type && type !== 'all') parts.push(`type: ${type}`);
    if (country) parts.push(`for students from ${country}`);
    if (region) parts.push(`(${region})`);
    if (level) parts.push(`level: ${level}`);
    if (field) parts.push(`field: ${field}`);
    if (destination) parts.push(`host country: ${destination}`);
    if (gpa) parts.push(`student GPA is ${gpa} — only include programs with minimum GPA ≤ ${gpa}`);
    if (extra) parts.push(`extra context: ${extra}`);

    const prompt = parts.join('. ') + '.';
    const text = await callClaude(system, prompt, 3500);

    // Extract JSON array robustly
    const clean = text.replace(/```json|```/g, '').trim();
    const match = clean.match(/\[[\s\S]*\]/);
    const opportunities = JSON.parse(match ? match[0] : clean);

    if (!Array.isArray(opportunities) || !opportunities.length) {
      throw new Error('No opportunities returned. Try different filters.');
    }

    res.json({ opportunities });
  } catch (err) {
    console.error('[/api/search]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── ANALYZE ENDPOINT ───────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  try {
    const { opportunity: o, country, gpa } = req.body;

    const system = `You are ScholarPath AI. Give a concise 3-4 sentence practical analysis. Be direct, encouraging, and specific. No markdown, no bullet points — plain text only.`;
    const prompt = `Analyze this opportunity for a student from ${country || 'a developing country'}${gpa ? ` with GPA ${gpa}` : ''}.
Program: ${o.title} by ${o.organization} (${o.country})
Type: ${o.type} | Funding: ${o.funding} — ${o.amount}
Eligible: ${o.eligible_countries} | Min GPA: ${o.gpa}
Benefits: ${o.benefits}
Description: ${o.description}

Highlight: (1) Is this student a strong match? (2) The strongest part of their application? (3) One key tip to stand out.`;

    const text = await callClaude(system, prompt, 350);
    res.json({ analysis: text });
  } catch (err) {
    console.error('[/api/analyze]', err.message);
    res.status(500).json({ error: 'AI analysis temporarily unavailable.' });
  }
});

// ─── START ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   🎓 ScholarPath AI  —  Running          ║
║   http://localhost:${PORT}                   ║
║   Press Ctrl+C to stop                  ║
╚══════════════════════════════════════════╝
  `);
});
