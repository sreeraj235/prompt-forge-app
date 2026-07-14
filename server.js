require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY. Copy .env.example to .env and add your key.');
  process.exit(1);
}

// Accept fairly large bodies since photo mode sends a base64-encoded image
app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Simple abuse guard: caps total generations per IP per hour.
// This protects your Anthropic bill from runaway or malicious usage.
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PER_HOUR) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You've hit the hourly limit. Try again a bit later." }
});
app.use('/api/', limiter);

// ---- Shared helper: call the Claude API and parse a JSON-shaped reply ----
async function callClaude(system, messages) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system,
      messages
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const raw = (data.content || []).map(b => b.text || '').join('');
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// Wraps a route handler so thrown errors become a clean JSON error response
function handle(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(502).json({ error: "Couldn't generate that prompt. Try again in a moment." });
    }
  };
}

// ---- Mode: Recreate a photo ----
app.post('/api/photo', handle(async (req) => {
  const { mediaType, base64 } = req.body;
  if (!mediaType || !base64) throw new Error('Missing image data');

  const system = `You analyze a photo and produce a detailed text-to-image prompt that would let someone recreate it closely. Respond ONLY with valid JSON, no markdown fences, no preamble, in this exact shape:
{
  "prompt": "the full ready-to-use recreation prompt as one paragraph",
  "subject": "short description of the subject/scene",
  "composition": "framing, angle, focal length feel",
  "lighting": "light quality, direction, time of day",
  "color_palette": "dominant tones and mood",
  "style": "photographic or artistic style, medium, era"
}`;
  const messages = [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
      { type: 'text', text: 'Analyze this photo and give me the JSON described in your instructions.' }
    ]
  }];
  return callClaude(system, messages);
}));

// ---- Mode: Research a topic ----
app.post('/api/research', handle(async (req) => {
  const { topic, depth, purpose } = req.body;
  if (!topic) throw new Error('Missing topic');

  const system = `You write a single, excellent prompt that someone can hand to an AI assistant to research a topic thoroughly. Respond ONLY with valid JSON, no markdown fences, no preamble, in this exact shape:
{
  "prompt": "the full ready-to-use research prompt as one paragraph, written as an instruction to an AI assistant",
  "key_angles": "the main angles or sub-questions this prompt will cause the assistant to cover",
  "sources_to_request": "what kinds of sources or evidence the prompt asks the assistant to draw on",
  "output_format": "what format the prompt asks the answer to come back in"
}`;
  const messages = [{
    role: 'user',
    content: `Topic: ${topic}\nDesired depth: ${depth}\nPurpose: ${purpose}\nWrite the research prompt now.`
  }];
  return callClaude(system, messages);
}));

// ---- Mode: Fix my prompt ----
app.post('/api/fix', handle(async (req) => {
  const { prompt, issue } = req.body;
  if (!prompt) throw new Error('Missing prompt');

  const system = `You are an expert prompt engineer. Given an existing prompt (and optionally what's going wrong with it), rewrite it into a clearer, more specific, better-structured prompt. Respond ONLY with valid JSON, no markdown fences, no preamble, in this exact shape:
{
  "prompt": "the full rewritten prompt, ready to use",
  "issues_found": "what was vague, missing, or likely causing weak results in the original",
  "what_changed": "the specific changes made and why they help",
  "best_for_model": "what kind of AI model or task this rewritten prompt is best suited for"
}`;
  const messages = [{
    role: 'user',
    content: `Original prompt: ${prompt}\n${issue ? 'Reported problem: ' + issue : 'No specific problem reported — improve it generally.'}\nRewrite it now.`
  }];
  return callClaude(system, messages);
}));

// ---- Mode: Job posting to resume/cover letter prompt ----
app.post('/api/resume', handle(async (req) => {
  const { job, background, doc } = req.body;
  if (!job || !background) throw new Error('Missing job or background');

  const system = `You write a single excellent prompt that someone can hand to an AI assistant to draft a tailored resume or cover letter. Respond ONLY with valid JSON, no markdown fences, no preamble, in this exact shape:
{
  "prompt": "the full ready-to-use prompt as one paragraph, written as an instruction to an AI assistant, embedding the relevant job requirements and the candidate's background",
  "key_requirements_matched": "the main job requirements the prompt tells the assistant to emphasize",
  "gaps_to_address": "anything in the candidate's background that doesn't perfectly match, and how the prompt handles it honestly",
  "tone": "the tone and style the prompt asks for"
}`;
  const messages = [{
    role: 'user',
    content: `Job description: ${job}\n\nCandidate background: ${background}\n\nDocument needed: ${doc}\nWrite the prompt now.`
  }];
  return callClaude(system, messages);
}));

// ---- Mode: Messy notes to writing prompt ----
app.post('/api/notes', handle(async (req) => {
  const { notes, format, tone } = req.body;
  if (!notes) throw new Error('Missing notes');

  const system = `You write a single excellent prompt that someone can hand to an AI assistant to turn rough notes into a polished piece of writing. Respond ONLY with valid JSON, no markdown fences, no preamble, in this exact shape:
{
  "prompt": "the full ready-to-use prompt as one paragraph, embedding the key content from the notes and the desired format and tone",
  "structure_imposed": "what structure or flow the prompt asks the assistant to give the piece",
  "key_points_captured": "the main ideas from the notes the prompt makes sure aren't lost",
  "tone": "the tone the prompt asks for"
}`;
  const messages = [{
    role: 'user',
    content: `Notes: ${notes}\n\nDesired format: ${format}\nDesired tone: ${tone}\nWrite the prompt now.`
  }];
  return callClaude(system, messages);
}));

app.listen(PORT, () => {
  console.log(`Prompt Forge running at http://localhost:${PORT}`);
});
