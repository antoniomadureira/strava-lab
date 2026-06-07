module.exports = async function handler(req, res) {
  // CORS para desenvolvimento local
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: "Código de autorização em falta" });
  }

  const clientId     = process.env.VITE_STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: "Variáveis de ambiente não configuradas",
      missing: [!clientId && "VITE_STRAVA_CLIENT_ID", !clientSecret && "STRAVA_CLIENT_SECRET"].filter(Boolean),
    });
  }

  try {
    const stravaRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id:     clientId,
        client_secret: clientSecret,
        code,
        grant_type:    "authorization_code",
      }),
    });

    const data = await stravaRes.json();

    if (data.access_token) {
      return res.status(200).json({
        access_token: data.access_token,
        athlete:      data.athlete,
        expires_at:   data.expires_at,
      });
    } else {
      return res.status(400).json({
        error:   "Falha na autenticação com o Strava",
        details: data.message || JSON.stringify(data),
      });
    }
  } catch (err) {
    return res.status(500).json({ error: "Erro interno: " + err.message });
  }
};
