module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const { system, messages } = req.body || {};
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY não configurada nas variáveis de ambiente da Vercel." });

  // Converte formato Anthropic → Gemini
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { maxOutputTokens: 1000, temperature: 0.7 },
        }),
      }
    );
    const data = await r.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (reply) return res.status(200).json({ reply });
    return res.status(500).json({ error: data.error?.message || "Resposta inválida do Gemini." });
  } catch (err) {
    return res.status(500).json({ error: "Erro interno: " + err.message });
  }
};
