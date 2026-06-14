export function calculateACWR(activities) {
  const byDay = {};
  activities.forEach(a => {
    const day = a.start_date.slice(0, 10);
    // Usar o suffer_score como base para a carga, ou uma estimativa se não disponível
    const load = a.suffer_score || ((a.moving_time / 3600) * 50); 
    byDay[day] = (byDay[day] || 0) + load;
  });

  const days = [];
  const today = new Date();

  // Calcular para os últimos 90 dias para ter uma base sólida para o CTL
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today - i * 86400000); // 86400000 ms = 1 dia
    const dateStr = d.toISOString().slice(0, 10);
    const dailyLoad = byDay[dateStr] || 0;

    // Calcular ATL (Acute Training Load) - média dos últimos 7 dias
    let atlSum = 0;
    for (let j = 0; j < 7; j++) {
      const pastDate = new Date(d - j * 86400000);
      const pastDateStr = pastDate.toISOString().slice(0, 10);
      atlSum += (byDay[pastDateStr] || 0);
    }
    const atl = atlSum / 7;

    // Calcular CTL (Chronic Training Load) - média dos últimos 28 dias
    let ctlSum = 0;
    for (let j = 0; j < 28; j++) {
      const pastDate = new Date(d - j * 86400000);
      const pastDateStr = pastDate.toISOString().slice(0, 10);
      ctlSum += (byDay[pastDateStr] || 0);
    }
    const ctl = ctlSum / 28;

    const acwr = ctl > 0 ? (atl / ctl) : 0; // Evitar divisão por zero

    days.push({
      date: dateStr,
      dailyLoad: +dailyLoad.toFixed(0),
      atl: +atl.toFixed(1),
      ctl: +ctl.toFixed(1),
      acwr: +acwr.toFixed(2),
    });
  }
  return days;
}

// Função para buscar dados de wellness do Intervals.icu
export async function fetchIntervalsWellnessData(athleteId, date) {
  try {
    const response = await fetch(`/api/intervals?athleteId=${athleteId}&date=${date}`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Erro ao buscar dados de wellness do Intervals.icu: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Erro ao buscar dados de wellness do Intervals.icu:", error);
    return null; // Retorna null ou um objeto de erro para ser tratado no frontend
  }
}