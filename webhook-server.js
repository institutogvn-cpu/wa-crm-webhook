const express = require("express");
const app = express();
app.use(express.json());

const EVOLUTION_URL = process.env.EVOLUTION_URL || "https://instituto-api.onrender.com";
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || "wacrm2025";
const INSTANCE_NAME = process.env.INSTANCE_NAME || "meu-whatapps";
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://hhrrrbzrlurjifaibmxx.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_6g08RrC5iAEc8oxPkA-m2w__s25uees";
const PORT = process.env.PORT || 3000;

const conversas = {};
const MAX_HIST = 10;

// SUPABASE
async function sbPost(table, body) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify(body)
    });
    if (!r.ok) console.error("SB error:", await r.text());
  } catch(e) { console.error("SB fetch error:", e.message); }
}

async function salvarConversa(phone, name, lastMsg) {
  const id = phone.replace(/\D/g, "");
  await sbPost("conversations", {
    id, phone: "+" + id, name: name || "+" + id,
    last_msg: lastMsg, last_time: new Date().toISOString(),
    unread: 1, updated_at: new Date().toISOString()
  });
  return id;
}

async function salvarMensagem(convId, fromMe, text) {
  await sbPost("messages", {
    conversation_id: convId, from_me: fromMe,
    text, created_at: new Date().toISOString()
  });
}

// CLAUDE
async function chamarClaude(systemPrompt, historico, mensagemAtual) {
  if (!ANTHROPIC_KEY) return null;
  try {
    const msgs = [
      ...historico.map(h => ({ role: h.de === "lead" ? "user" : "assistant", content: h.texto })),
      { role: "user", content: mensagemAtual }
    ];
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 400, system: systemPrompt, messages: msgs })
    });
    const data = await r.json();
    return data.content?.[0]?.text || null;
  } catch(e) { console.error("Claude error:", e.message); return null; }
}

async function enviarWhatsApp(phone, texto) {
  try {
    await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVOLUTION_KEY },
      body: JSON.stringify({ number: phone, text: texto })
    });
  } catch(e) { console.error("WA send error:", e.message); }
}

const PROMPT_PORTEIRO = `Você é o SDR do Instituto Gustavo Vila Nova, especializado em Mentoria de Liderança com Constelação Familiar. 
Qualifique leads em até 3 mensagens. Pergunte: cargo/área, maior desafio de liderança hoje, se já conhece constelação.
Tom: acolhedor, curioso, sem pressão. Seja direto e humano. Máximo 3 parágrafos curtos.
Nunca invente informações sobre o programa. Nunca dê preços. Crie conexão e curiosidade.`;

// WEBHOOK
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    const event = body.event || "";
    if (!event.toLowerCase().includes("messages")) return;

    const data = body.data || body;
    const msg = Array.isArray(data.messages) ? data.messages[0] : data.message || data;
    if (!msg || !msg.key) return;
    if (msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid || "";
    if (remoteJid.includes("@g.us")) return;

    const phone = remoteJid.replace("@s.whatsapp.net", "");
    const name = msg.pushName || msg.notifyName || "+" + phone;
    const texto = msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || msg.message?.imageMessage?.caption
      || "[mídia]";

    console.log(`MSG de ${name} (${phone}): ${texto}`);

    const convId = await salvarConversa(phone, name, texto);
    await salvarMensagem(convId, false, texto);

    if (!conversas[phone]) conversas[phone] = [];
    conversas[phone].push({ de: "lead", texto });
    if (conversas[phone].length > MAX_HIST) conversas[phone].shift();

    if (ANTHROPIC_KEY) {
      const resposta = await chamarClaude(PROMPT_PORTEIRO, conversas[phone].slice(0, -1), texto);
      if (resposta) {
        await enviarWhatsApp(phone, resposta);
        conversas[phone].push({ de: "agente", texto: resposta });
        await salvarMensagem(convId, true, resposta);
        console.log(`Resposta enviada para ${phone}`);
      }
    }
  } catch(e) { console.error("Webhook error:", e.message); }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", supabase: SUPABASE_URL, claude: !!ANTHROPIC_KEY, ts: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`Webhook na porta ${PORT} | Supabase OK`));
