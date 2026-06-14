const fetch = require("node-fetch");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  const { athleteId, date } = req.query;
  const apiKey = process.env.INTERVALS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "INTERVALS_API_KEY não configurada nas variáveis de ambiente." });
  }
  if (!athleteId || !date) {
    return res.status(400).json({ error: "athleteId e date são parâmetros obrigatórios." });
  }

  try {
    const url = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness?date=${date}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    } );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao buscar dados do Intervals.icu: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error("Erro na API do Intervals.icu:", err);
    return res.status(500).json({ error: "Erro interno ao comunicar com Intervals.icu: " + err.message });
  }
};