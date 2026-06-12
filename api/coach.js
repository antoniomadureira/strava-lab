const { GoogleGenerativeAI } = require("@google/generative-ai");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const { system, messages } = req.body || {};
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY não configurada nas variáveis de ambiente da Vercel." });
  }

  try {
    // Inicialização do SDK da Google
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Configuração do modelo e das instruções de sistema
    const modelConfig = { model: "gemini-2.5-flash" };
    if (system) {
        modelConfig.systemInstruction = system;
    }
    
    const model = genAI.getGenerativeModel(modelConfig);

    // Conversão do formato
    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // Chamada à API
    const result = await model.generateContent({
      contents,
      generationConfig: { maxOutputTokens: 4096, temperature: 0.7 }
    });

    const reply = result.response.text();
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: "Erro interno: " + err.message });
  }
};