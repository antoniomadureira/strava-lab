export default async function handler(req, res) {
  // Apenas aceitamos pedidos POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Código de autorização em falta' });
  }

  try {
    // Fazemos o pedido ao Strava pelo lado do servidor
    const stravaResponse = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.VITE_STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET, // Escondido do público!
        code: code,
        grant_type: 'authorization_code',
      }),
    });

    const data = await stravaResponse.json();

    if (data.access_token) {
      // Devolvemos o token limpo ao nosso front-end
      return res.status(200).json(data);
    } else {
      return res.status(400).json({ error: 'Falha ao autenticar no Strava', details: data });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}