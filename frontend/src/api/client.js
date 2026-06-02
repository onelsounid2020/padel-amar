const API_URL = import.meta.env.VITE_API_URL || "/api";
let authToken = localStorage.getItem("amar_auth_token") || "";

export function setAuthToken(token) {
  authToken = token || "";
  if (authToken) localStorage.setItem("amar_auth_token", authToken);
  else localStorage.removeItem("amar_auth_token");
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Error de API" }));
    throw new Error(error.detail || "Error de API");
  }

  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  login: (data) => request("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  registerPlayer: (data) => request("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  me: () => request("/auth/me"),
  users: () => request("/auth/users"),
  createUser: (data) => request("/auth/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (userId, data) => request(`/auth/users/${userId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteUser: (userId) => request(`/auth/users/${userId}`, { method: "DELETE" }),
  myPermissions: () => request("/auth/permissions/me"),
  permissionModules: () => request("/auth/permissions/modules"),
  rolePermissions: () => request("/auth/role-permissions"),
  updateRolePermissions: (role, permissions) =>
    request(`/auth/role-permissions/${role}`, { method: "PATCH", body: JSON.stringify({ permissions }) }),
  dashboard: () => request("/events/dashboard"),
  events: () => request("/events"),
  createEvent: (data) => request("/events", { method: "POST", body: JSON.stringify(data) }),
  updateEvent: (eventId, data) => request(`/events/${eventId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteEvent: (eventId) => request(`/events/${eventId}`, { method: "DELETE" }),
  players: () => request("/players"),
  createPlayer: (data) => request("/players", { method: "POST", body: JSON.stringify(data) }),
  pairs: (eventId) => request(`/events/${eventId}/pairs`),
  createPair: (eventId, data) => request(`/events/${eventId}/pairs`, { method: "POST", body: JSON.stringify(data) }),
  updatePair: (eventId, pairId, data) =>
    request(`/events/${eventId}/pairs/${pairId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deletePair: (eventId, pairId) => request(`/events/${eventId}/pairs/${pairId}`, { method: "DELETE" }),
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
  publicRegister: (eventId, data) =>
    request(`/public/events/${eventId}/registrations`, { method: "POST", body: JSON.stringify(data) }),
  publicMembers: () => request("/public/members"),
};
