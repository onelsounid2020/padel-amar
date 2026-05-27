const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Error de API" }));
    throw new Error(error.detail || "Error de API");
  }

  return response.json();
}

export const api = {
  dashboard: () => request("/events/dashboard"),
  events: () => request("/events"),
  createEvent: (data) => request("/events", { method: "POST", body: JSON.stringify(data) }),
  updateEvent: (eventId, data) => request(`/events/${eventId}`, { method: "PATCH", body: JSON.stringify(data) }),
  players: () => request("/players"),
  createPlayer: (data) => request("/players", { method: "POST", body: JSON.stringify(data) }),
  pairs: (eventId) => request(`/events/${eventId}/pairs`),
  createPair: (eventId, data) => request(`/events/${eventId}/pairs`, { method: "POST", body: JSON.stringify(data) }),
  updatePair: (eventId, pairId, data) =>
    request(`/events/${eventId}/pairs/${pairId}`, { method: "PATCH", body: JSON.stringify(data) }),
  payments: (eventId) => request(`/events/${eventId}/payments`),
  updatePayment: (eventId, paymentId, data) =>
    request(`/events/${eventId}/payments/${paymentId}`, { method: "PATCH", body: JSON.stringify(data) }),
  matches: (eventId) => request(`/events/${eventId}/matches`),
  createMatch: (eventId, data) => request(`/events/${eventId}/matches`, { method: "POST", body: JSON.stringify(data) }),
  generateFixture: (eventId, minimumMatches = 5, courts = [], options = {}) => {
    const params = new URLSearchParams({
      minimum_matches: String(minimumMatches),
      format: options.format || "groups",
      group_size: String(options.groupSize || 4),
      courts_per_group: String(options.courtsPerGroup || 2),
      start_time: options.startTime || "17:00",
      set_minutes: String(options.setMinutes || 22),
    });
    if (courts.length) params.set("courts", courts.join(","));
    return request(`/events/${eventId}/matches/generate-fixture?${params.toString()}`, { method: "POST" });
  },
  generateBracket: (eventId, courts = []) => {
    const params = new URLSearchParams();
    if (courts.length) params.set("courts", courts.join(","));
    const query = params.toString();
    return request(`/events/${eventId}/matches/generate-bracket${query ? `?${query}` : ""}`, { method: "POST" });
  },
  registerResult: (eventId, matchId, data) =>
    request(`/events/${eventId}/matches/${matchId}/result`, { method: "PATCH", body: JSON.stringify(data) }),
  standings: (eventId) => request(`/events/${eventId}/standings`),
  finalRanking: (eventId) => request(`/events/${eventId}/standings/ranking-final`),
  whatsapp: (eventId) => request(`/events/${eventId}/whatsapp`),
};
