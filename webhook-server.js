const express = require("express");
const app = express();
app.use(express.json());

// ═══════════════════════════════════════════
// CONFIGURAÇÕES
// ═══════════════════════════════════════════
const EVOLUTION_URL = process.env.EVOLUTION_URL || "https://instituto-api.onrender.com";
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || "wacrm2025";
const INSTANCE_NAME = process.env.INSTANCE_NAME || "meu-whatapps";
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || "";
const PORT = process.env.PORT || 3000;

// Memória de conversas por número
const conversas = {};
const MAX_HIST = 10; // máximo de mensagens por conversa

// ═══════════════════════════════════════════
// AGENTES IA
// ═══════════════════════════════════════════
const AGENTES = {
  porteiro: {
    nome: "Porteiro",
    prompt: `Você é o SDR especializado em Mentoria de Liderança com Constelação Familiar. 
Qualifique leads em até 3 mensagens. Pergunte: cargo/área, maior desafio de liderança hoje, se já conhece constelação.
Tom: acolhedor, curioso, sem pressão. Seja direto e humano. Máximo 3 parágrafos curtos.
Responda SEMPRE em português do Brasil.`,
  },
  proposta: {
    nome: "Proposta",
    prompt: `Você cria propostas de Mentoria de Liderança e Constelação Familiar personalizadas.
Use a dor específica do lead como âncora. Mostre transformação, não serviço.
Inclua investimento com ancoragem de valor e ROI emocional e profissional.
Responda SEMPRE em português do Brasil. Seja conciso para WhatsApp.`,
  },
  objecao: {
    nome: "Objeção",
    prompt: `Você contorna objeções de leads de Mentoria de Liderança.
Use Feel-Felt-Found adaptado ao contexto de desenvolvimento humano.
Seja empático, nunca confronte. Reframe objeções de preço como investimento em transformação.
Responda SEMPRE em português do Brasil. Máximo 3 parágrafos.`,
  },
  nutricao: {
    nome: "Nutrição",
    prompt: `Você nutre leads frios de Mentoria de Liderança e Constelação Familiar.
Compartilhe insights profundos, cases de transformação, perguntas reflexivas.
Nunca venda diretamente. Crie conexão e confiança.
Tom: sábio, acolhedor, inspirador. Máximo 2 parágrafos. Responda em português do Brasil.`,
  },
  closer: {
    nome: "Closer",
    prompt: `Você é o Closer especializado em mentorias e formações de alto valor.
Use urgência genuína (vagas, turmas). Lembre o custo da inação. CTA claro e direto.
Tom: confiante, caloroso, sem pressão agressiva.
Responda SEMPRE em português do Brasil. Seja conciso para WhatsApp.`,
  },
};

// Detecta qual agente usar baseado na mensagem
function detectarAgente(texto, historico) {
  const t = texto.toLowerCase();

  // Sinais de objeção
  if (t.includes("caro") || t.includes("preço") || t.includes("valor") ||
      t.includes("desconto") || t.includes("parcel") || t.includes("não tenho") ||
      t.includes("muito") && t.includes("dinheiro")) {
    return "objecao";
  }

  // Sinais de compra / fechamento
  if (t.includes("quero") || t.includes("vamos") || t.includes("fechar") ||
      t.includes("como faço") || t.includes("pagar") || t.includes("matricul") ||
      t.includes("quando começa") || t.includes("próxima turma")) {
    return "closer";
  }

  // Pedido de proposta
  if (t.includes("proposta") || t.includes("valores") || t.includes("quanto custa") ||
      t.includes("planos") || t.includes("investimento") || t.includes("preço")) {
    return "proposta";
  }

  // Conversa longa = nutrição
  if (historico.length > 6) return "nutricao";

  // Padrão = porteiro para qualificar
  return "porteiro";
}

// ═══════════════════════════════════════════
// RESPOSTA COM CLAUDE
// ═══════════════════════════════════════════
async function responderComClaude(numero, mensagem, agente) {
  if (!ANTHROPIC_KEY) return responderDemo(agente, mensagem);

  if (!conversas[numero]) conversas[numero] = [];

  // Adiciona mensagem do usuário
  conversas[numero].push({ role: "user", content: mensagem });

  // Mantém histórico limitado
  const hist = conversas[numero].slice(-MAX_HIST);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        system: AGENTES[agente].prompt,
        messages: hist,
      }),
    });

    const data = await res.json();
    const reply = data.content?.[0]?.text || "Desculpe, tive um problema técnico. Pode repetir?";

    // Adiciona resposta ao histórico
    conversas[numero].push({ role: "assistant", content: reply });

    return reply;
  } catch (e) {
    console.error("Erro Claude:", e.message);
    return responderDemo(agente, mensagem);
  }
}

// Respostas demo quando não tem API Key
function responderDemo(agente, mensagem) {
  const demos = {
    porteiro: "Oi! 🌟 Obrigado por entrar em contato!\n\nSou assistente da Mentoria de Liderança. Para te ajudar melhor, me conta: qual é sua área de atuação e você lidera equipes hoje?",
    proposta: "Que ótimo interesse! 📄\n\nVou preparar uma proposta personalizada para você. Me conta: qual é o seu maior desafio de liderança hoje e qual seria um investimento confortável para seu desenvolvimento?",
    objecao: "Entendo completamente sua preocupação! 🙏\n\nPensa assim: quanto você perde por mês com desafios não resolvidos na liderança? Na maioria dos casos, o investimento se paga nos primeiros 60 dias.\n\nO que te faria sentir seguro para dar esse passo?",
    nutricao: "Oi! 🌿\n\nUm insight que compartilho com líderes: 90% dos problemas de equipe têm raiz em padrões que herdamos — não em falta de técnica.\n\nComo está sua semana?",
    closer: "Que ótimo! 🎉\n\nTenho mais 2 vagas abertas nessa turma. Posso reservar a sua agora? Te envio o link de acesso em seguida!",
  };
  return demos[agente] || demos.porteiro;
}

// ═══════════════════════════════════════════
// ENVIAR MENSAGEM VIA EVOLUTION API
// ═══════════════════════════════════════════
async function enviarMensagem(numero, texto) {
  try {
    const res = await fetch(
      `${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_KEY,
        },
        body: JSON.stringify({
          number: numero,
          text: texto,
        }),
      }
    );
    const data = await res.json();
    console.log(`✅ Mensagem enviada para ${numero}`);
    return data;
  } catch (e) {
    console.error("Erro ao enviar mensagem:", e.message);
  }
}

// ═══════════════════════════════════════════
// WEBHOOK — RECEBE MENSAGENS DO WHATSAPP
// ═══════════════════════════════════════════
app.post("/webhook", async (req, res) => {
  res.status(200).json({ ok: true }); // Responde rápido para a Evolution API

  try {
    const body = req.body;

    // Verifica se é mensagem recebida
    if (body.event !== "messages.upsert") return;
    const msg = body.data?.messages?.[0];
    if (!msg) return;

    // Ignora mensagens próprias
    if (msg.key?.fromMe) return;

    const numero = msg.key?.remoteJid?.replace("@s.whatsapp.net", "");
    const texto = msg.message?.conversation ||
                  msg.message?.extendedTextMessage?.text || "";

    if (!numero || !texto) return;

    console.log(`📩 Mensagem de ${numero}: ${texto.slice(0, 60)}`);

    // Detecta agente ideal
    const hist = conversas[numero] || [];
    const agente = detectarAgente(texto, hist);
    console.log(`🤖 Agente selecionado: ${AGENTES[agente].nome}`);

    // Gera resposta
    const resposta = await responderComClaude(numero, texto, agente);

    // Aguarda 1-2s para parecer mais humano
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));

    // Envia resposta
    await enviarMensagem(numero, resposta);

  } catch (e) {
    console.error("Erro no webhook:", e.message);
  }
});

// ═══════════════════════════════════════════
// ROTAS UTILITÁRIAS
// ═══════════════════════════════════════════

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "🟢 Online",
    servico: "WA-CRM Webhook — Mentoria de Liderança",
    instancia: INSTANCE_NAME,
    conversas_ativas: Object.keys(conversas).length,
    claude: ANTHROPIC_KEY ? "✅ Ativo" : "⚠️ Modo Demo",
    timestamp: new Date().toISOString(),
  });
});

// Ver conversas ativas
app.get("/conversas", (req, res) => {
  const resumo = Object.entries(conversas).map(([num, hist]) => ({
    numero: num,
    mensagens: hist.length,
    ultima: hist[hist.length - 1]?.content?.slice(0, 60) + "...",
  }));
  res.json({ total: resumo.length, conversas: resumo });
});

// Limpar histórico de um número
app.delete("/conversas/:numero", (req, res) => {
  delete conversas[req.params.numero];
  res.json({ ok: true, mensagem: "Histórico limpo" });
});

// Disparo manual
app.post("/disparar", async (req, res) => {
  const { numero, mensagem } = req.body;
  if (!numero || !mensagem) {
    return res.status(400).json({ erro: "numero e mensagem são obrigatórios" });
  }
  await enviarMensagem(numero, mensagem);
  res.json({ ok: true, enviado_para: numero });
});

// ═══════════════════════════════════════════
// START
// ═══════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n🚀 WA-CRM Webhook rodando na porta ${PORT}`);
  console.log(`📡 Evolution API: ${EVOLUTION_URL}`);
  console.log(`📱 Instância: ${INSTANCE_NAME}`);
  console.log(`🤖 Claude: ${ANTHROPIC_KEY ? "Ativo" : "Modo Demo"}\n`);
});
