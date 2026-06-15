import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  CalendarPlus,
  Clock,
  Clipboard,
  CreditCard,
  ExternalLink,
  FileCheck2,
  Check,
  Eye,
  EyeOff,
  LogOut,
  ListChecks,
  Medal,
  Menu,
  RefreshCw,
  Save,
  Swords,
  Target,
  Trophy,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { ApiError, api, setAuthToken } from "./api/client";
import { computeFinalPlans, computeFinalRanking, computeRankingPlacementFixture } from "./lib/fixtureFinals";
import { pairName } from "./lib/pairs";
import { TabletResults } from "./pages/TabletResults";
import "./styles.css";

const emptyEvent = {
  name: "",
  date: "",
  place: "",
  categories: "",
  price: 0,
  schedule: "",
  capacity: 16,
  tournament_type: "Americano",
  category_configs: [],
  ranking_config: {},
  fixture_config: {},
  description: "",
  status: "registration_open",
  is_active: true,
};

const defaultRankingConfig = {
  win_points: 3,
  draw_points: 1,
  loss_points: 0,
  tiebreakers: ["points", "won", "difference", "points_for"],
};

const defaultFixtureConfig = {
  mode: "groups",
  group_size: 4,
  guaranteed_matches: 5,
  court_count: 11,
  courts: "1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11",
  rental_minutes: 120,
  warmup_minutes: 10,
  set_minutes: 20,
  start_time: "17:00",
  planner_category: "",
  planner_rounds: 5,
  planner_courts: "1, 2, 3",
  planner_replace_unplayed: true,
};

const eventStatusOptions = [
  { value: "draft", label: "Borrador" },
  { value: "published", label: "Publicado" },
  { value: "registration_open", label: "Inscripción abierta" },
  { value: "registration_closed", label: "Inscripción cerrada" },
  { value: "live", label: "En juego" },
  { value: "finished", label: "Finalizado" },
];

const eventStatusLabels = Object.fromEntries(eventStatusOptions.map((option) => [option.value, option.label]));

const rankingTiebreakerOptions = [
  { value: "points", label: "Puntos" },
  { value: "won", label: "Partidos ganados" },
  { value: "difference", label: "Diferencia" },
  { value: "points_for", label: "Juegos a favor" },
  { value: "played", label: "Partidos jugados" },
];

const pairLevelOptions = [
  { value: 4, label: "Bajo", tone: "low" },
  { value: 6, label: "Medio", tone: "mid" },
  { value: 8, label: "Alto", tone: "high" },
];

const emptyPlayer = { name: "", phone: "", category: "", preferred_side: "indiferente" };
const emptyPublicRegistration = {
  name: "",
  email: "",
  phone: "",
  paid: false,
  gender: "hombre",
  category: "4ta",
  preferred_side: "indiferente",
  partner_name: "",
  partner_email: "",
  partner_phone: "",
  partner_member_id: "",
  partner_paid: false,
  partner_preferred_side: "indiferente",
};
const emptyPublicResult = { round_name: "", match_id: "", pair_one_score: "", pair_two_score: "" };

const fallbackPermissionModules = [
  { key: "events", label: "Eventos", description: "Crear eventos, editar configuración y organizar parejas." },
  { key: "register", label: "Registro", description: "Ver formulario público de inscripción a eventos." },
  { key: "results", label: "Resultados", description: "Consultar o cargar resultados desde la vista pública." },
  { key: "tablet", label: "Tablet", description: "Usar la mesa de resultados optimizada para cancha." },
  { key: "users", label: "Usuarios", description: "Crear cuentas y asignar roles a jugadores u operadores." },
  { key: "profiles", label: "Perfiles", description: "Configurar qué módulos puede ver cada rol." },
];

const publicPermissions = {
  events: false,
  register: true,
  results: true,
  tablet: false,
  users: false,
  profiles: false,
};

const categoryOptions = {
  hombre: ["1era", "2da", "3ra", "4ta", "5ta", "6ta"],
  mujer: ["D+", "C+", "B+", "A+"],
  mixto: ["Mixto 4ta C+", "5ta D+"],
};

const eventCategoryGroups = [
  { key: "hombre", label: "Hombres", categories: categoryOptions.hombre },
  { key: "mujer", label: "Mujeres", categories: categoryOptions.mujer },
  { key: "mixto", label: "Mixto", categories: categoryOptions.mixto },
];

const allPadelCategories = eventCategoryGroups.flatMap((group) => group.categories);
const tabletAccessStorageKey = "amar_tablet_access_token";
const rememberedDeviceStorageKey = "amar_remembered_player_device";

function readRememberedDevice() {
  try {
    const value = localStorage.getItem(rememberedDeviceStorageKey);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeRememberedDevice(user, fallbackEmail = "") {
  if (!user && !fallbackEmail) return null;
  const remembered = {
    email: user?.email || fallbackEmail,
    name: user?.name || fallbackEmail,
    role: user?.role || "jugador",
    rememberedAt: new Date().toISOString(),
  };
  localStorage.setItem(rememberedDeviceStorageKey, JSON.stringify(remembered));
  return remembered;
}

function clearRememberedDevice() {
  localStorage.removeItem(rememberedDeviceStorageKey);
}

function categoryLabel(category) {
  return category;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || "").trim());
}

function playerIdentityKey(player) {
  if (!player) return "";
  if (player.user_id) return `user:${player.user_id}`;
  if (player.email) return `email:${String(player.email).trim().toLowerCase()}`;
  return `name:${String(player.name || "").trim().replace(/\s+/g, " ").toLowerCase()}`;
}

function mergePlayersFromPairs(players, pairs) {
  const byIdentity = new Map();
  function addPlayer(player) {
    const key = playerIdentityKey(player);
    if (!key) return;
    const current = byIdentity.get(key);
    if (!current) {
      byIdentity.set(key, player);
      return;
    }
    if (!current.user_id && player.user_id) {
      byIdentity.set(key, player);
    }
  }
  players.forEach(addPlayer);
  pairs.forEach((pair) => {
    addPlayer(pair.player_one);
    addPlayer(pair.player_two);
  });
  return [...byIdentity.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function participantOptionKey(option) {
  if (!option) return "";
  if (option.kind === "member") return `member:${option.id}`;
  return `player:${option.id}`;
}

function mergeParticipantOptions(players, pairs, members) {
  const byIdentity = new Map();
  mergePlayersFromPairs(players, pairs).forEach((player) => {
    byIdentity.set(playerIdentityKey(player), { ...player, kind: "player", value: `player:${player.id}` });
  });
  members.forEach((member) => {
    const key = member.id ? `user:${member.id}` : member.email ? `email:${String(member.email).trim().toLowerCase()}` : "";
    if (!key || byIdentity.has(key)) return;
    byIdentity.set(key, {
      ...member,
      kind: "member",
      value: `member:${member.id}`,
      user_id: member.id,
      category: member.category || "5ta",
      preferred_side: member.preferred_side || "indiferente",
    });
  });
  return [...byIdentity.values()].sort((left, right) => left.name.localeCompare(right.name));
}

async function resolveParticipantPlayerId(value, options, category) {
  if (!value) return null;
  if (String(value).startsWith("player:")) return Number(String(value).replace("player:", ""));
  if (!String(value).startsWith("member:")) return Number(value);
  const option = options.find((item) => item.value === value);
  if (!option) return null;
  const created = await api.createPlayer({
    user_id: option.id,
    name: option.name,
    email: option.email || null,
    phone: option.phone || null,
    category: category || option.category || "5ta",
    preferred_side: option.preferred_side || "indiferente",
  });
  return created.id;
}

function pageFromLocation() {
  if (typeof window === "undefined") return "events";
  const view = new URLSearchParams(window.location.search).get("view");
  const path = window.location.pathname;
  if (path === "/tablet" || view === "tablet") return "tablet";
  if (path === "/usuarios" || view === "users") return "users";
  if (path === "/perfiles" || view === "profiles") return "profiles";
  if (path === "/perfil" || view === "player") return "player";
  if (path === "/partners" || view === "partners") return "partners";
  if (path === "/crear-cuenta" || view === "signup") return "signup";
  if (path === "/registro" || view === "register") return "register";
  if (path === "/resultados" || view === "results") return "results";
  if (path === "/partidos" || view === "matches") return "matches";
  return "events";
}

function isEventActive(event) {
  return event.is_active !== false && !["draft", "finished"].includes(event.status);
}

function todayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isPastEvent(event) {
  return Boolean(event.date) && event.date < todayDateString();
}

function App() {
  const [dashboard, setDashboard] = useState([]);
  const [events, setEvents] = useState([]);
  const [players, setPlayers] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [payments, setPayments] = useState([]);
  const [matches, setMatches] = useState([]);
  const [resultSubmissions, setResultSubmissions] = useState([]);
  const [standings, setStandings] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [users, setUsers] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventForm, setEventForm] = useState(emptyEvent);
  const [playerForm, setPlayerForm] = useState(emptyPlayer);
  const [pairForm, setPairForm] = useState({ player_one_id: "", player_two_id: "", category: "", skill_level: 5, status: "buscando_partner" });
  const [matchForm, setMatchForm] = useState({ pair_one_id: "", pair_two_id: "", round_name: "Grupo", court: "" });
  const [fixtureForm, setFixtureForm] = useState(defaultFixtureConfig);
  const [rankingConfigForm, setRankingConfigForm] = useState(defaultRankingConfig);
  const [resultForm, setResultForm] = useState({});
  const [publicForm, setPublicForm] = useState(emptyPublicRegistration);
  const [publicResultForm, setPublicResultForm] = useState(emptyPublicResult);
  const [registrationSuccess, setRegistrationSuccess] = useState(null);
  const [registrationNotice, setRegistrationNotice] = useState(null);
  const [signupNotice, setSignupNotice] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [whatsapp, setWhatsapp] = useState("");
  const [authUser, setAuthUser] = useState(null);
  const [currentPermissions, setCurrentPermissions] = useState(publicPermissions);
  const [permissionModules, setPermissionModules] = useState(fallbackPermissionModules);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [rememberedDevice, setRememberedDevice] = useState(() => readRememberedDevice());
  const [loginForm, setLoginForm] = useState(() => {
    const remembered = readRememberedDevice();
    return { email: remembered?.email || "", password: "", remember_device: Boolean(remembered) };
  });
  const [signupForm, setSignupForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    category: "5ta",
    preferred_side: "indiferente",
    remember_device: true,
  });
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", role: "jugador" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(pageFromLocation);
  const [navOpen, setNavOpen] = useState(false);
  const selectedEventIdRef = useRef(selectedEventId);
  const navMenuRef = useRef(null);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === Number(selectedEventId)),
    [events, selectedEventId],
  );
  const activeEvents = useMemo(() => events.filter(isEventActive), [events]);

  function clearEventData() {
    setPairs([]);
    setRegistrations([]);
    setPayments([]);
    setMatches([]);
    setResultSubmissions([]);
    setStandings([]);
    setRanking([]);
    setWhatsapp("");
  }

  function selectEventId(nextEventId) {
    const nextValue = nextEventId ? String(nextEventId) : "";
    if (selectedEventIdRef.current !== nextValue) clearEventData();
    selectedEventIdRef.current = nextValue;
    setSelectedEventId(nextValue);
  }

  function navigatePage(nextPage) {
    const paths = {
      events: "/",
      register: "/registro",
      results: "/resultados",
      matches: "/partidos",
      tablet: "/tablet",
      users: "/usuarios",
      profiles: "/perfiles",
      player: "/perfil",
      partners: "/partners",
      signup: "/crear-cuenta",
    };
    setNavOpen(false);
    setPage(nextPage);
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", paths[nextPage] || "/");
    }
  }

  useEffect(() => {
    if (!navOpen) return undefined;

    function closeOnOutsideClick(event) {
      if (!navMenuRef.current?.contains(event.target)) setNavOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") setNavOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [navOpen]);

  async function loadBase(userOverride = authUser, permissionOverride = currentPermissions) {
    const effectiveUser = userOverride;
    const effectivePermissions = effectiveUser?.role === "superadmin"
      ? Object.fromEntries(fallbackPermissionModules.map((module) => [module.key, true]))
      : permissionOverride;
    const [dashboardData, eventsData, playersData, userData, memberData] = await Promise.all([
      api.dashboard(),
      api.events(),
      effectiveUser && effectivePermissions.events ? api.players() : Promise.resolve([]),
      effectiveUser && effectivePermissions.users ? api.users() : Promise.resolve([]),
      api.publicMembers(),
    ]);
    setDashboard(dashboardData);
    setEvents(eventsData);
    setPlayers(playersData);
    setUsers(userData);
    setMembers(memberData);
    if (!selectedEventId) {
      const nextEvent = eventsData.find(isEventActive) || eventsData[0];
      if (nextEvent) selectEventId(nextEvent.id);
    }
  }

  async function loadEventData(eventId, userOverride = authUser, permissionOverride = currentPermissions) {
    const targetEventId = eventId || selectedEventIdRef.current;
    if (!targetEventId) {
      clearEventData();
      return;
    }
    const requestedEventId = String(targetEventId);
    const effectiveUser = userOverride;
    const effectivePermissions = effectiveUser?.role === "superadmin"
      ? Object.fromEntries(fallbackPermissionModules.map((module) => [module.key, true]))
      : permissionOverride;
    const canLoadSubmissions = Boolean(effectiveUser);
    const [pairData, registrationData, paymentData, matchData, submissionData, standingData, rankingData, whatsappData] = await Promise.all([
      api.pairs(requestedEventId),
      effectiveUser && effectivePermissions.events ? api.eventRegistrations(requestedEventId) : Promise.resolve([]),
      effectiveUser && effectivePermissions.events ? api.payments(requestedEventId) : Promise.resolve([]),
      api.matches(requestedEventId),
      canLoadSubmissions ? api.resultSubmissions(requestedEventId) : Promise.resolve([]),
      api.standings(requestedEventId),
      api.finalRanking(requestedEventId),
      api.whatsapp(requestedEventId),
    ]);
    if (selectedEventIdRef.current !== requestedEventId) return;
    setPairs(pairData);
    setRegistrations(registrationData);
    setPayments(paymentData);
    setMatches(matchData);
    setResultSubmissions(submissionData);
    setStandings(standingData);
    setRanking(rankingData);
    setWhatsapp(whatsappData.text);
  }

  function canAccess(moduleKey) {
    if (moduleKey === "signup") return true;
    if (!authUser) return Boolean(publicPermissions[moduleKey]);
    if (authUser.role === "superadmin") return true;
    return Boolean(currentPermissions[moduleKey]);
  }

  async function loadPermissions(userOverride = authUser) {
    if (!userOverride) {
      setCurrentPermissions(publicPermissions);
      setRolePermissions([]);
      return publicPermissions;
    }
    const permissionData = await api.myPermissions();
    setCurrentPermissions(permissionData);
    if (permissionData.profiles || userOverride.role === "superadmin") {
      const [modulesData, rolePermissionsData] = await Promise.all([
        api.permissionModules(),
        api.rolePermissions(),
      ]);
      setPermissionModules(modulesData);
      setRolePermissions(rolePermissionsData);
    }
    return permissionData;
  }

  function confirmAction(dialog) {
    setConfirmDialog({
      tone: "default",
      confirmLabel: "Confirmar",
      cancelLabel: "Cancelar",
      ...dialog,
    });
  }

  async function run(action) {
    setLoading(true);
    setError("");
    try {
      await action();
      await loadBase();
      await loadEventData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    selectedEventIdRef.current = selectedEventId ? String(selectedEventId) : "";
  }, [selectedEventId]);

  useEffect(() => {
    run(loadBase);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isTabletPage = pageFromLocation() === "tablet";
    const urlTabletAccessToken = isTabletPage ? params.get("access") : "";
    const storedTabletAccessToken = isTabletPage ? localStorage.getItem(tabletAccessStorageKey) || "" : "";

    async function loginTablet(accessToken, { remember = false } = {}) {
      setLoading(true);
      try {
        const response = await api.tabletLogin(accessToken);
        if (remember) localStorage.setItem(tabletAccessStorageKey, accessToken);
        setAuthToken(response.access_token);
        setAuthUser(response.user);
        const permissions = await loadPermissions(response.user);
        await loadBase(response.user, permissions);
        await loadEventData(selectedEventId, response.user, permissions);
        window.history.replaceState({}, "", "/tablet");
      } catch (err) {
        setAuthToken("");
        if (isTabletPage) localStorage.removeItem(tabletAccessStorageKey);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (urlTabletAccessToken) {
      loginTablet(urlTabletAccessToken, { remember: true });
      return;
    }

    api.me()
      .then(async (user) => {
        setAuthUser(user);
        const permissions = await loadPermissions(user);
        await loadBase(user, permissions);
        await loadEventData(selectedEventId, user, permissions);
      })
      .catch(() => {
        setAuthToken("");
        if (storedTabletAccessToken) {
          loginTablet(storedTabletAccessToken);
        }
      });
  }, []);

  useEffect(() => {
    if (!authUser) return;
    loadBase().catch((err) => setError(err.message));
    loadEventData(selectedEventId).catch((err) => setError(err.message));
    if (authUser.role === "jugador") {
      setPublicForm((current) => ({
        ...current,
        name: current.name || authUser.name,
        email: current.email || authUser.email || "",
        phone: current.phone || authUser.phone || "",
        category: current.category || authUser.category || "5ta",
        preferred_side: current.preferred_side || authUser.preferred_side || "indiferente",
      }));
    }
  }, [authUser?.id]);

  useEffect(() => {
    loadEventData(selectedEventId).catch((err) => setError(err.message));
  }, [selectedEventId]);

  useEffect(() => {
    if (!["events", "results"].includes(page) || !selectedEventId || !authUser || !canAccess(page === "events" ? "events" : "results")) return undefined;
    const interval = window.setInterval(() => {
      Promise.all([
        loadBase().catch((err) => setError(err.message)),
        loadEventData(selectedEventId).catch((err) => setError(err.message)),
      ]);
    }, 8000);
    return () => window.clearInterval(interval);
  }, [page, selectedEventId, authUser?.id, currentPermissions.events, currentPermissions.results]);

  useEffect(() => {
    if (page === "events") return;
    if (!selectedEventId && activeEvents[0]) {
      selectEventId(activeEvents[0].id);
      return;
    }
    if (selectedEvent && !isEventActive(selectedEvent) && !(page === "results" && authUser?.role !== "jugador")) {
      selectEventId(activeEvents[0]?.id || "");
    }
  }, [page, selectedEventId, selectedEvent?.id, selectedEvent?.is_active, activeEvents, authUser?.role]);

  useEffect(() => {
    function handlePopState() {
      setPage(pageFromLocation());
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  async function submitEvent(event) {
    event.preventDefault();
    await run(async () => {
      const payload = {
        ...eventForm,
        price: Number(eventForm.price),
        capacity: Number(eventForm.capacity),
        category_configs: (eventForm.category_configs || [])
          .filter((config) => config.category.trim())
          .map((config) => ({
            ...config,
            category: config.category.trim(),
            group_size: Number(config.group_size || 0),
            guaranteed_matches: Number(config.guaranteed_matches || 0),
            qualifiers_per_group: Number(config.qualifiers_per_group || 0),
            notes: config.notes || "",
        })),
        ranking_config: eventForm.ranking_config || rankingConfigForm || defaultRankingConfig,
        fixture_config: eventForm.fixture_config || fixtureForm || defaultFixtureConfig,
      };
      if (!selectedEventId) payload.is_active = true;
      if (selectedEventId) {
        const updated = await api.updateEvent(selectedEventId, payload);
        selectEventId(updated.id);
      } else {
        const created = await api.createEvent(payload);
        selectEventId(created.id);
        setEventForm(emptyEvent);
      }
    });
  }

  async function submitPlayer(event) {
    event.preventDefault();
    await run(async () => {
      await api.createPlayer({ ...playerForm, phone: playerForm.phone || null });
      setPlayerForm(emptyPlayer);
    });
  }

  async function submitPair(event) {
    event.preventDefault();
    await run(async () => {
      const participantOptions = mergeParticipantOptions(players, pairs, members);
      const playerOneId = await resolveParticipantPlayerId(pairForm.player_one_id, participantOptions, pairForm.category);
      const playerTwoId = pairForm.player_two_id
        ? await resolveParticipantPlayerId(pairForm.player_two_id, participantOptions, pairForm.category)
        : null;
      await api.createPair(selectedEventId, {
        ...pairForm,
        player_one_id: playerOneId,
        player_two_id: playerTwoId,
        skill_level: Number(pairForm.skill_level || 5),
      });
      setPairForm({ player_one_id: "", player_two_id: "", category: "", skill_level: 5, status: "buscando_partner" });
    });
  }

  async function submitMatch(event) {
    event.preventDefault();
    await run(async () => {
      await api.createMatch(selectedEventId, {
        ...matchForm,
        pair_one_id: Number(matchForm.pair_one_id),
        pair_two_id: Number(matchForm.pair_two_id),
        court: matchForm.court || null,
      });
      setMatchForm({ pair_one_id: "", pair_two_id: "", round_name: "Grupo", court: "" });
    });
  }

  async function submitGenerateFixture() {
    await run(async () => {
      const courts = fixtureForm.courts.split(",").map((court) => court.trim()).filter(Boolean);
      const timing = deriveFixtureTiming(selectedEvent?.schedule || eventForm.schedule, Number(fixtureForm.warmup_minutes || 0));
      const isGroupsWithFinals = fixtureForm.mode === "groups_finals";
      await api.generateFixture(selectedEventId, isGroupsWithFinals ? 3 : Number(fixtureForm.guaranteed_matches), courts, {
        format: "groups",
        groupSize: isGroupsWithFinals ? 4 : Number(fixtureForm.group_size || 4),
        courtsPerGroup: 2,
        startTime: timing.fixtureStart || fixtureForm.start_time || "17:00",
        setMinutes: Number(fixtureForm.set_minutes || 22),
      });
    });
  }

  async function submitGenerateBracket() {
    await run(async () => {
      const courts = fixtureForm.courts.split(",").map((court) => court.trim()).filter(Boolean);
      await api.generateBracket(selectedEventId, courts);
    });
  }

  async function submitPublicRegistration(event) {
    event.preventDefault();
    setError("");
    setRegistrationSuccess(null);
    setRegistrationNotice(null);

    const playerEmail = (authUser?.role === "jugador" ? authUser.email : publicForm.email).trim().toLowerCase();
    const partnerEmail = publicForm.partner_email.trim().toLowerCase();
    const comesWithPartner = Boolean(publicForm.partner_member_id);

    if (!selectedEventId) {
      setError("Selecciona un evento para inscribirte.");
      return;
    }
    if (authUser?.role !== "jugador") {
      setError("Debes entrar con una cuenta de jugador para inscribirte.");
      return;
    }
    if (!publicForm.name.trim()) {
      setError("Ingresa el nombre del jugador.");
      return;
    }
    if (!isValidEmail(playerEmail)) {
      setError("Ingresa un email valido para el jugador.");
      return;
    }

    setLoading(true);
    try {
      const eventCategories = [
        ...new Set([
          ...(selectedEvent?.category_configs || []).map((config) => config.category).filter(Boolean),
          ...(selectedEvent?.categories || "").split("/").map((category) => category.trim()).filter(Boolean),
        ]),
      ];
      const category = categoryLabel(publicForm.category || eventCategories[0] || "1era");
      const registration = await api.publicRegister(selectedEventId, {
        player_user_id: authUser?.role === "jugador" ? authUser.id : null,
        name: publicForm.name,
        email: playerEmail,
        phone: publicForm.phone || null,
        paid: publicForm.paid,
        category,
        preferred_side: publicForm.preferred_side,
        partner_user_id: publicForm.partner_member_id || null,
        partner_name: publicForm.partner_name || null,
        partner_email: partnerEmail || null,
        partner_phone: publicForm.partner_phone || null,
        partner_paid: publicForm.partner_paid,
        partner_preferred_side: publicForm.partner_preferred_side,
      });

      setRegistrationSuccess({
        eventName: selectedEvent?.name || "Evento",
        playerName: publicForm.name,
        partnerName: publicForm.partner_name,
        waitlisted: registration.pair?.status === "lista_espera",
      });
      setPublicForm(authUser?.role === "jugador" ? {
        ...emptyPublicRegistration,
        name: authUser.name || "",
        email: authUser.email || "",
        phone: authUser.phone || "",
        category: authUser.category || "5ta",
        preferred_side: authUser.preferred_side || "indiferente",
      } : emptyPublicRegistration);
      await loadBase();
      await loadEventData(selectedEventId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setRegistrationNotice({
          title: "Ya existe una inscripción",
          message: err.message || "Uno de los jugadores ya está inscrito en este evento.",
          eventName: selectedEvent?.name || "este evento",
        });
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitPublicResult(event) {
    event.preventDefault();
    await run(async () => {
      await api.submitResult(selectedEventId, publicResultForm.match_id, {
        pair_one_score: Number(publicResultForm.pair_one_score),
        pair_two_score: Number(publicResultForm.pair_two_score),
      });
      setPublicResultForm(emptyPublicResult);
    });
  }

  async function submitPlayerMatchResult(matchId, pairOneScore, pairTwoScore) {
    await run(async () => {
      await api.submitResult(selectedEventId, matchId, {
        pair_one_score: Number(pairOneScore),
        pair_two_score: Number(pairTwoScore),
      });
    });
  }

  async function submitOfficialResult(matchId, pairOneScore, pairTwoScore) {
    await run(async () => {
      await api.registerResult(selectedEventId, matchId, {
        pair_one_score: Number(pairOneScore),
        pair_two_score: Number(pairTwoScore),
      });
    });
  }

  async function submitFinalRankingFixture(finalMatches) {
    if (!selectedEventId || !finalMatches.length) return;
    await run(async () => {
      await api.createMatchesBulk(selectedEventId, finalMatches, false);
    });
  }

  async function joinPartnerPair(pairId) {
    await run(async () => {
      await api.joinPair(selectedEventId, pairId);
    });
  }

  async function deleteSelectedEvent() {
    if (!selectedEventId || !selectedEvent) return;
    confirmAction({
      tone: "danger",
      title: "Eliminar evento",
      message: `Se borrará "${selectedEvent.name}" junto con sus parejas, pagos, partidos, resultados y ranking.`,
      confirmLabel: "Eliminar evento",
      onConfirm: async () => {
        await run(async () => {
          await api.deleteEvent(selectedEventId);
          const remainingEvents = await api.events();
          const nextEvent = remainingEvents.find(isEventActive) || remainingEvents[0];
          selectEventId(nextEvent?.id || "");
          setEventForm(emptyEvent);
        });
      },
    });
  }

  async function closeSelectedEvent() {
    if (!selectedEventId || !selectedEvent) return;
    confirmAction({
      title: "Cerrar evento",
      message: `"${selectedEvent.name}" dejará de aparecer en Registro, Resultados y los selectores principales. Sus datos quedarán guardados.`,
      confirmLabel: "Cerrar evento",
      onConfirm: async () => {
        setLoading(true);
        setError("");
        try {
          await api.updateEvent(selectedEventId, { is_active: false });
          const eventsData = await api.events();
          const nextEvent = eventsData.find((event) => isEventActive(event) && String(event.id) !== String(selectedEventId))
            || eventsData.find((event) => String(event.id) !== String(selectedEventId))
            || null;
          setEvents(eventsData);
          selectEventId(nextEvent?.id || "");
          await loadBase();
          if (nextEvent) await loadEventData(String(nextEvent.id));
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function finishSelectedEvent() {
    if (!selectedEventId || !selectedEvent) return;
    const pendingMatches = matches.filter((match) => !matchHasResult(match)).length;
    const conflictCount = resultSubmissions.filter((submission) => submission.status === "conflicto").length;
    confirmAction({
      tone: pendingMatches || conflictCount ? "danger" : "default",
      title: "Finalizar evento",
      message: pendingMatches || conflictCount
        ? `Todavía hay ${pendingMatches} partido(s) sin resultado y ${conflictCount} reporte(s) en conflicto. El evento quedará cerrado igualmente.`
        : `Se cerrará "${selectedEvent.name}" y quedarán consolidados sus resultados y ranking.`,
      confirmLabel: pendingMatches || conflictCount ? "Finalizar de todas formas" : "Finalizar evento",
      onConfirm: async () => {
        await run(async () => {
          await api.recalculateStandings(selectedEventId);
          await api.updateEvent(selectedEventId, { status: "finished", is_active: false });
        });
      },
    });
  }

  async function activateSelectedEvent() {
    if (!selectedEventId || !selectedEvent) return;
    await run(async () => {
      const updated = await api.updateEvent(selectedEventId, { is_active: true });
      selectEventId(updated.id);
    });
  }

  async function closePastEvents() {
    const pastActiveEvents = events.filter((event) => isEventActive(event) && isPastEvent(event));
    if (!pastActiveEvents.length) {
      setError("No hay eventos pasados activos para cerrar.");
      return;
    }
    confirmAction({
      title: "Cerrar eventos pasados",
      message: `${pastActiveEvents.length} evento(s) pasado(s) dejarán de aparecer en Registro, Resultados y los selectores principales.`,
      confirmLabel: "Cerrar pasados",
      onConfirm: async () => {
        setLoading(true);
        setError("");
        try {
          await Promise.all(pastActiveEvents.map((event) => api.updateEvent(event.id, { is_active: false })));
          const eventsData = await api.events();
          const nextEvent = eventsData.find(isEventActive) || eventsData[0] || null;
          setEvents(eventsData);
          selectEventId(nextEvent?.id || "");
          await loadBase();
          if (nextEvent) await loadEventData(String(nextEvent.id));
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function submitRankingConfig(config) {
    if (!selectedEventId) return;
    await run(async () => {
      await api.updateEvent(selectedEventId, { ranking_config: config });
      await api.recalculateStandings(selectedEventId);
    });
  }

  async function submitLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { remember_device: rememberDevice, ...credentials } = loginForm;
      const response = await api.login(credentials);
      setAuthToken(response.access_token, { persistent: Boolean(rememberDevice) });
      if (rememberDevice) setRememberedDevice(writeRememberedDevice(response.user, credentials.email));
      else {
        clearRememberedDevice();
        setRememberedDevice(null);
      }
      setAuthUser(response.user);
      const permissionData = await loadPermissions(response.user);
      await loadBase(response.user, permissionData);
      await loadEventData(selectedEventId, response.user, permissionData);
      if (response.user.role === "jugador") navigatePage("player");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitSignup(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSignupNotice(null);
    try {
      const { remember_device: rememberDevice, ...playerData } = signupForm;
      const response = await api.registerPlayer({
        ...playerData,
        phone: signupForm.phone || null,
      });
      setAuthToken(response.access_token, { persistent: Boolean(rememberDevice) });
      if (rememberDevice) setRememberedDevice(writeRememberedDevice(response.user, playerData.email));
      else {
        clearRememberedDevice();
        setRememberedDevice(null);
      }
      setAuthUser(response.user);
      await loadPermissions(response.user);
      setPublicForm({
        ...emptyPublicRegistration,
        name: response.user.name,
        email: response.user.email || "",
        phone: response.user.phone || "",
        category: response.user.category || signupForm.category,
        preferred_side: response.user.preferred_side || "indiferente",
      });
      setSignupNotice({
        type: "success",
        title: "Perfil creado",
        message: `${response.user.name} ya tiene su perfil jugador listo.`,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.message.toLowerCase().includes("email")) {
        setSignupNotice({
          type: "duplicate",
          title: "Ese email ya existe",
          message: "Ya hay una cuenta creada con ese correo. Usa el acceso existente o prueba con otro email.",
        });
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setAuthToken("");
    localStorage.removeItem(tabletAccessStorageKey);
    setAuthUser(null);
    setPlayers([]);
    setPayments([]);
    setUsers([]);
    setCurrentPermissions(publicPermissions);
    setRolePermissions([]);
  }

  function forgetRememberedDevice() {
    clearRememberedDevice();
    setRememberedDevice(null);
    setLoginForm((current) => ({ ...current, email: "", password: "", remember_device: false }));
  }

  async function submitUser(event) {
    event.preventDefault();
    const normalizedEmail = userForm.email.trim().toLowerCase();
    const existingUser = users.find((user) => user.email.toLowerCase() === normalizedEmail);
    if (existingUser) {
      setError(`Ese email ya existe: ${existingUser.name} figura como ${existingUser.role}.`);
      return;
    }
    await run(async () => {
      await api.createUser({ ...userForm, email: normalizedEmail });
      setUserForm({ name: "", email: "", password: "", role: "jugador" });
    });
  }

  async function updateUser(userId, payload) {
    await run(async () => {
      await api.updateUser(userId, payload);
    });
  }

  async function resetUserPassword(userId) {
    let resetResponse = null;
    await run(async () => {
      resetResponse = await api.resetUserPassword(userId);
    });
    return resetResponse;
  }

  async function deleteUser(user) {
    confirmAction({
      tone: "danger",
      title: "Eliminar usuario",
      message: `Se eliminará la cuenta de "${user.name}".`,
      confirmLabel: "Eliminar usuario",
      onConfirm: async () => {
        await run(async () => {
          await api.deleteUser(user.id);
        });
      },
    });
  }

  async function submitRolePermissions(role, permissions) {
    await run(async () => {
      const updated = await api.updateRolePermissions(role, permissions);
      setRolePermissions((current) => current.map((item) => (item.role === role ? updated : item)));
      if (authUser?.role === role) {
        setCurrentPermissions(updated.permissions);
      }
    });
  }

  async function updateRegistration(registrationId, payload) {
    await run(async () => {
      await api.updateEventRegistration(selectedEventId, registrationId, payload);
    });
  }

  const pageContent = page === "register" ? (
    <PublicRegistration
      events={activeEvents}
      selectedEventId={selectedEventId}
      setSelectedEventId={selectEventId}
      selectedEvent={selectedEvent}
      authUser={authUser}
      members={members}
      form={publicForm}
      setForm={setPublicForm}
      success={registrationSuccess}
      setSuccess={setRegistrationSuccess}
      notice={registrationNotice}
      setNotice={setRegistrationNotice}
      onSubmit={submitPublicRegistration}
      loading={loading}
      pairs={pairs}
      goSignup={() => navigatePage("signup")}
      goLogin={() => navigatePage("events")}
    />
  ) : page === "player" ? (
    <PlayerProfile
      events={activeEvents}
      pairs={pairs}
      registrations={registrations}
      matches={matches}
      resultSubmissions={resultSubmissions}
      standings={standings}
      authUser={authUser}
      selectedEventId={selectedEventId}
      setSelectedEventId={selectEventId}
      selectedEvent={selectedEvent}
      loading={loading}
      onSubmitResult={submitPlayerMatchResult}
      onRefresh={() => run(loadEventData)}
      goRegister={() => navigatePage("register")}
      goLogin={() => navigatePage("events")}
    />
  ) : page === "partners" ? (
    <PartnerFinder
      events={activeEvents}
      pairs={pairs}
      authUser={authUser}
      selectedEventId={selectedEventId}
      setSelectedEventId={selectEventId}
      selectedEvent={selectedEvent}
      loading={loading}
      onJoinPair={joinPartnerPair}
      goRegister={() => navigatePage("register")}
      goSignup={() => navigatePage("signup")}
      goLogin={() => navigatePage("events")}
    />
  ) : page === "signup" ? (
    <SignupPage
      form={signupForm}
      setForm={setSignupForm}
      onSubmit={submitSignup}
      loading={loading}
      notice={signupNotice}
      setNotice={setSignupNotice}
      goRegister={() => {
        setSignupNotice(null);
        navigatePage("register");
      }}
      goLogin={() => navigatePage("events")}
    />
  ) : page === "results" ? (
    <PublicResults
      events={authUser && authUser.role !== "jugador" ? events : activeEvents}
      pairs={pairs}
      matches={matches}
      resultSubmissions={resultSubmissions}
      standings={standings}
      ranking={ranking}
      authUser={authUser}
      selectedEventId={selectedEventId}
      setSelectedEventId={selectEventId}
      selectedEvent={selectedEvent}
      form={publicResultForm}
      setForm={setPublicResultForm}
      onSubmit={submitPublicResult}
      rankingConfig={rankingConfigForm}
      setRankingConfig={setRankingConfigForm}
      onSaveRanking={submitRankingConfig}
      onOfficialResult={submitOfficialResult}
      onGenerateFinalFixture={submitFinalRankingFixture}
      onFinishEvent={finishSelectedEvent}
      onRefresh={() => run(loadEventData)}
      loading={loading}
      canEditScores={canAccess("tablet")}
      canManageEvent={canAccess("events")}
    />
  ) : page === "tablet" ? (
    <TabletResults
      events={activeEvents}
      pairs={pairs}
      matches={matches}
      resultSubmissions={resultSubmissions}
      standings={standings}
      selectedEventId={selectedEventId}
      setSelectedEventId={selectEventId}
      selectedEvent={selectedEvent}
      onSave={run}
      loading={loading}
      onRefresh={() => run(loadBase)}
    />
  ) : page === "matches" ? (
    canAccess("events") ? <EventsPage
      events={events}
      players={players}
      members={members}
      pairs={pairs}
      payments={payments}
      registrations={registrations}
      matches={matches}
      resultSubmissions={resultSubmissions}
      standings={standings}
      ranking={ranking}
      selectedEvent={selectedEvent}
      selectedEventId={selectedEventId}
      setSelectedEventId={selectEventId}
      eventForm={eventForm}
      setEventForm={setEventForm}
      playerForm={playerForm}
      setPlayerForm={setPlayerForm}
      pairForm={pairForm}
      setPairForm={setPairForm}
      matchForm={matchForm}
      setMatchForm={setMatchForm}
      fixtureForm={fixtureForm}
      setFixtureForm={setFixtureForm}
      resultForm={resultForm}
      setResultForm={setResultForm}
      rankingConfigForm={rankingConfigForm}
      setRankingConfigForm={setRankingConfigForm}
      whatsapp={whatsapp}
      submitEvent={submitEvent}
      submitPlayer={submitPlayer}
      submitPair={submitPair}
      submitMatch={submitMatch}
      submitGenerateFixture={submitGenerateFixture}
      submitGenerateBracket={submitGenerateBracket}
      submitRankingConfig={submitRankingConfig}
      deleteSelectedEvent={deleteSelectedEvent}
      closeSelectedEvent={closeSelectedEvent}
      activateSelectedEvent={activateSelectedEvent}
      closePastEvents={closePastEvents}
      updateRegistration={updateRegistration}
      confirmAction={confirmAction}
      authUser={authUser}
      run={run}
      forcedTab="matches"
    /> : <AccessDenied moduleName="Partidos" />
  ) : page === "users" ? (
    canAccess("users") ? (
      <UsersPage
        authUser={authUser}
        users={users}
        form={userForm}
        setForm={setUserForm}
        onSubmit={submitUser}
        onUpdateUser={updateUser}
        onResetPassword={resetUserPassword}
        onDeleteUser={deleteUser}
      />
    ) : (
      <AccessDenied moduleName="Usuarios" />
    )
  ) : page === "profiles" ? (
    canAccess("profiles") ? (
      <ProfilePermissionsPage
        modules={permissionModules}
        rolePermissions={rolePermissions}
        onSave={submitRolePermissions}
        loading={loading}
      />
    ) : (
      <AccessDenied moduleName="Perfiles" />
    )
  ) : (
    canAccess("events") ? <EventsPage
      events={events}
      players={players}
      members={members}
      pairs={pairs}
      payments={payments}
      registrations={registrations}
      matches={matches}
      resultSubmissions={resultSubmissions}
      standings={standings}
      ranking={ranking}
      selectedEvent={selectedEvent}
      selectedEventId={selectedEventId}
      setSelectedEventId={selectEventId}
      eventForm={eventForm}
      setEventForm={setEventForm}
      playerForm={playerForm}
      setPlayerForm={setPlayerForm}
      pairForm={pairForm}
      setPairForm={setPairForm}
      matchForm={matchForm}
      setMatchForm={setMatchForm}
      fixtureForm={fixtureForm}
      setFixtureForm={setFixtureForm}
      resultForm={resultForm}
      setResultForm={setResultForm}
      rankingConfigForm={rankingConfigForm}
      setRankingConfigForm={setRankingConfigForm}
      whatsapp={whatsapp}
      submitEvent={submitEvent}
      submitPlayer={submitPlayer}
      submitPair={submitPair}
      submitMatch={submitMatch}
      submitGenerateFixture={submitGenerateFixture}
      submitGenerateBracket={submitGenerateBracket}
      submitRankingConfig={submitRankingConfig}
      deleteSelectedEvent={deleteSelectedEvent}
      closeSelectedEvent={closeSelectedEvent}
      activateSelectedEvent={activateSelectedEvent}
      closePastEvents={closePastEvents}
      updateRegistration={updateRegistration}
      confirmAction={confirmAction}
      authUser={authUser}
      run={run}
    /> : <AccessDenied moduleName="Eventos" />
  );

  const navigationItems = [
    authUser?.role === "jugador" && { key: "player", label: "Mi perfil", icon: UserPlus },
    authUser?.role === "jugador" && { key: "partners", label: "Partners", icon: Users },
    canAccess("events") && { key: "events", label: "Eventos", icon: CalendarPlus },
    canAccess("events") && { key: "matches", label: "Partidos", icon: Swords },
    canAccess("results") && { key: "results", label: "Resultados", icon: FileCheck2 },
    canAccess("tablet") && { key: "tablet", label: "Tablet", icon: Clipboard },
    canAccess("register") && { key: "register", label: "Registro", icon: UserPlus },
    canAccess("users") && { key: "users", label: "Usuarios", icon: Users },
    canAccess("profiles") && { key: "profiles", label: "Perfiles", icon: ListChecks },
  ].filter(Boolean);
  const activeNavigationItem = navigationItems.find((item) => item.key === page);

  const appHeader = (
    <header className="topbar">
      <div className="topbar-brand">
        <p className="eyebrow">Padel Manager</p>
        <h1>Gestión de eventos</h1>
      </div>
      <div className="top-actions">
        <nav className="app-nav" aria-label="Secciones">
          {navigationItems.map(({ key, label }) => (
            <button key={key} className={page === key ? "active" : ""} onClick={() => navigatePage(key)}>{label}</button>
          ))}
        </nav>
        <button className="icon-button" onClick={() => run(loadBase)} disabled={loading} title="Actualizar">
          <RefreshCw size={18} />
        </button>
        {authUser && <button className="secondary-action" type="button" onClick={logout}>Salir</button>}
      </div>
      <div className="mobile-nav" ref={navMenuRef}>
        <button
          className="nav-menu-trigger"
          type="button"
          aria-expanded={navOpen}
          aria-controls="mobile-navigation-menu"
          onClick={() => setNavOpen((current) => !current)}
        >
          <span>{activeNavigationItem?.label || "Menú"}</span>
          <Menu size={20} />
        </button>
        {navOpen && (
          <div className="mobile-nav-menu" id="mobile-navigation-menu">
            <nav aria-label="Secciones">
              {navigationItems.map(({ key, label, icon: Icon }) => (
                <button key={key} className={page === key ? "active" : ""} onClick={() => navigatePage(key)}>
                  <Icon size={18} />
                  <span>{label}</span>
                  {page === key && <Check className="mobile-nav-check" size={17} />}
                </button>
              ))}
            </nav>
            <div className="mobile-nav-actions">
              <button type="button" onClick={() => { setNavOpen(false); run(loadBase); }} disabled={loading}>
                <RefreshCw size={18} /> Actualizar
              </button>
              {authUser && <button type="button" onClick={logout}><LogOut size={18} /> Salir</button>}
            </div>
          </div>
        )}
      </div>
    </header>
  );

  if (page === "tablet") {
    if (!authUser) {
      return (
        <main className="tablet-shell">
          {error && <div className="alert tablet-alert">{error}</div>}
          <LoginPage
            form={loginForm}
            setForm={setLoginForm}
            onSubmit={submitLogin}
            loading={loading}
            compact
            rememberedDevice={rememberedDevice}
            onForgetDevice={forgetRememberedDevice}
          />
        </main>
      );
    }
    return (
      <main className="tablet-shell">
        {appHeader}
        {error && <div className="alert tablet-alert">{error}</div>}
        {canAccess("tablet") ? pageContent : <AccessDenied moduleName="Tablet" />}
      </main>
    );
  }

  if (!authUser && ["events", "matches", "users", "profiles", "player", "partners"].includes(page)) {
    return (
      <main className="app-shell">
        {error && <div className="alert">{error}</div>}
        <LoginPage
          form={loginForm}
          setForm={setLoginForm}
          onSubmit={submitLogin}
          loading={loading}
          goSignup={() => navigatePage("signup")}
          rememberedDevice={rememberedDevice}
          onForgetDevice={forgetRememberedDevice}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      {appHeader}

      {error && <div className="alert">{error}</div>}
      <ConfirmModal dialog={confirmDialog} setDialog={setConfirmDialog} loading={loading} />

      {canAccess("events") && page !== "player" && (
        <section className="metrics">
          {dashboard.map((event) => (
            <article className="metric-card" key={event.id}>
              <strong>{event.name}</strong>
              <span>{event.available_spots} cupos disponibles</span>
              <span>{event.pending_payments} pagos pendientes</span>
              <span>{event.completed_matches} resultados</span>
            </article>
          ))}
        </section>
      )}

      {pageContent}
    </main>
  );
}

function ConfirmModal({ dialog, setDialog, loading }) {
  useEffect(() => {
    if (!dialog) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape" && !loading) setDialog(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [dialog, loading, setDialog]);

  if (!dialog) return null;

  async function confirm() {
    await dialog.onConfirm();
    setDialog(null);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !loading && setDialog(null)}>
      <div className={`registration-modal confirm-modal ${dialog.tone === "danger" ? "danger" : ""}`} role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={() => setDialog(null)} aria-label="Cerrar aviso" disabled={loading}>
          <X size={18} />
        </button>
        <div className={`modal-icon ${dialog.tone === "danger" ? "danger" : ""}`}>
          <AlertCircle size={24} />
        </div>
        <div>
          <p className="eyebrow">Confirmación</p>
          <h2 id="confirm-modal-title">{dialog.title}</h2>
          <p>{dialog.message}</p>
          {dialog.detail && <small>{dialog.detail}</small>}
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-action" onClick={() => setDialog(null)} disabled={loading}>
            {dialog.cancelLabel}
          </button>
          <button type="button" className={dialog.tone === "danger" ? "danger-action" : ""} onClick={confirm} disabled={loading}>
            {loading ? "Procesando..." : dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoginPage({ form, setForm, onSubmit, loading, compact = false, goSignup, rememberedDevice, onForgetDevice }) {
  const [showPassword, setShowPassword] = useState(false);
  const hasRememberedDevice = Boolean(rememberedDevice?.email);

  return (
    <section className={compact ? "login-page compact" : "login-page"}>
      <div className="login-card">
        <p className="eyebrow">Acceso AmarPadel</p>
        <h1>{compact ? "Acceso operador" : "Entra a tu cuenta"}</h1>
        <p>{compact ? "Ingresa con una cuenta autorizada para cargar resultados." : "Usa tu cuenta jugador o administrativa para continuar."}</p>
        {hasRememberedDevice && (
          <div className="remembered-device-card">
            <div>
              <span>Dispositivo recordado</span>
              <strong>{rememberedDevice.name || rememberedDevice.email}</strong>
              <small>{rememberedDevice.email}</small>
            </div>
            <button type="button" className="secondary-action" onClick={onForgetDevice}>No soy yo</button>
          </div>
        )}
        <form onSubmit={onSubmit} className="login-form" autoComplete="off">
          <label className="form-field">
            <span>Email</span>
            <input
              type="email"
              name="amar-login-email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
          </label>
          <label className="form-field">
            <span>Contraseña</span>
            <div className="password-input-wrap">
              <input
                type={showPassword ? "text" : "password"}
                name="amar-login-password"
                autoComplete="current-password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          <label className="remember-device-toggle">
            <input
              type="checkbox"
              checked={Boolean(form.remember_device)}
              onChange={(event) => setForm({ ...form, remember_device: event.target.checked })}
            />
            <span>
              <strong>Recordar este dispositivo</strong>
              <small>Mantiene tu sesión y tu email listos en este navegador. No guarda tu contraseña.</small>
            </span>
          </label>
          <button disabled={loading}>Entrar</button>
        </form>
        {!compact && goSignup && (
          <div className="login-register-callout">
            <span>No tienes cuenta?</span>
            <button type="button" className="secondary-action" onClick={goSignup}>
              Crear cuenta
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function SignupPage({ form, setForm, onSubmit, loading, notice, setNotice, goRegister, goLogin }) {
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!notice) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setNotice(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [notice, setNotice]);

  return (
    <section className="signup-page">
      {notice && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setNotice(null)}>
          <div className="registration-modal" role="dialog" aria-modal="true" aria-labelledby="signup-notice-title" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setNotice(null)} aria-label="Cerrar aviso">
              <X size={18} />
            </button>
            <div className={`modal-icon ${notice.type === "success" ? "success" : ""}`}>
              {notice.type === "success" ? <Check size={24} /> : <AlertCircle size={24} />}
            </div>
            <div>
              <p className="eyebrow">Perfil jugador</p>
              <h2 id="signup-notice-title">{notice.title}</h2>
              <p>{notice.message}</p>
              {notice.type === "success" ? (
                <small>Ahora puedes inscribirte a un evento usando tus datos guardados.</small>
              ) : (
                <small>Si ya tienes cuenta, entra con tus credenciales para continuar.</small>
              )}
            </div>
            <div className="modal-actions">
              {notice.type === "success" ? (
                <button type="button" onClick={goRegister}>Continuar al registro</button>
              ) : (
                <>
                  <button type="button" onClick={() => setNotice(null)}>Cambiar email</button>
                  <button type="button" className="secondary-action" onClick={goLogin}>Ir al acceso</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="signup-shell">
        <aside className="signup-intro">
          <p className="eyebrow">Miembros AMAR</p>
          <h2>Tu perfil jugador</h2>
          <p>Una cuenta por jugador mantiene las inscripciones limpias, evita duplicados y deja tus datos listos para cada evento.</p>
          <div className="signup-benefits">
            <span>Inscripción rápida</span>
            <span>Partner registrado</span>
            <span>Menos datos repetidos</span>
          </div>
        </aside>
        <div className="signup-card">
          <div className="signup-card-head">
            <p className="eyebrow">Crear cuenta</p>
            <h2>Datos del jugador</h2>
            <p>Completa tu perfil una vez y úsalo para inscribirte.</p>
          </div>
          <form onSubmit={onSubmit} className="signup-form">
            <label className="form-field">
              <span>Nombre</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nombre y apellido" required />
            </label>
            <label className="form-field">
              <span>Email</span>
              <input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="tu@email.com" required />
            </label>
            <label className="form-field">
              <span>Contraseña</span>
              <div className="password-input-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <label className="form-field">
              <span>Teléfono</span>
              <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Opcional" />
            </label>
            <label className="form-field">
              <span>Categoría habitual</span>
              <CategorySelect value={form.category} onChange={(category) => setForm({ ...form, category })} />
            </label>
            <label className="form-field">
              <span>Lado preferido</span>
              <select value={form.preferred_side} onChange={(event) => setForm({ ...form, preferred_side: event.target.value })}>
                <option value="drive">Drive</option>
                <option value="reves">Revés</option>
                <option value="indiferente">Indiferente</option>
              </select>
            </label>
            <label className="remember-device-toggle wide-field">
              <input
                type="checkbox"
                checked={Boolean(form.remember_device)}
                onChange={(event) => setForm({ ...form, remember_device: event.target.checked })}
              />
              <span>
                <strong>Recordar este dispositivo</strong>
                <small>Después de crear tu perfil, este navegador sabrá quién eres para entrar más rápido.</small>
              </span>
            </label>
            <button disabled={loading}>Crear perfil y continuar</button>
          </form>
          <button type="button" className="secondary-action" onClick={goLogin}>Ya tengo cuenta</button>
        </div>
      </div>
    </section>
  );
}

function parseFixtureRoundLabel(roundName) {
  const parts = (roundName || "Grupo").split(" - ");
  const lastPart = parts[parts.length - 1] || "";
  const hasTime = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(lastPart);
  return {
    category: parts[0] || "Sin categoria",
    group: parts[1] || "",
    time: hasTime ? lastPart : "",
    turn: (hasTime ? parts.slice(1, -1) : parts.slice(1)).filter(Boolean).join(" - ") || roundName || "Grupo",
  };
}

function matchHasResult(match) {
  return match.pair_one_score !== null && match.pair_one_score !== undefined
    && match.pair_two_score !== null && match.pair_two_score !== undefined;
}

function minutesFromMatch(match) {
  const { time, turn } = parseFixtureRoundLabel(match.round_name);
  const start = (time || turn || "").split("-")[0];
  const [hours, minutes] = start.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 9999;
  return (hours * 60) + minutes;
}

function pairHasUser(pair, userId) {
  return Boolean(pair && userId && (
    pair.player_one?.user_id === userId || pair.player_two?.user_id === userId
  ));
}

function buildPlayerNotices({ myPair, myRegistration, nextMatch, pairById, mySubmissions }) {
  const notices = [];
  if (!myPair) {
    notices.push({
      severity: "warning",
      title: "Aún no estás inscrito",
      message: "Inscríbete a un evento o busca una dupla que necesite partner.",
    });
    return notices;
  }
  if (myPair.status === "buscando_partner") {
    notices.push({
      severity: "warning",
      title: "Tu dupla sigue incompleta",
      message: "Puedes esperar a que alguien se una desde Partners o coordinar con la organización.",
    });
  } else {
    notices.push({
      severity: "success",
      title: "Partner confirmado",
      message: "Tu dupla está completa para este evento.",
    });
  }
  if (myRegistration && !myRegistration.checked_in) {
    notices.push({
      severity: "warning",
      title: "Check-in pendiente",
      message: "Al llegar al club, avisa a la mesa para marcar tu presencia.",
    });
  }
  if (nextMatch) {
    const schedule = parseFixtureRoundLabel(nextMatch.round_name);
    const pairOne = pairById.get(nextMatch.pair_one_id);
    const pairTwo = pairById.get(nextMatch.pair_two_id);
    const rival = nextMatch.pair_one_id === myPair.id ? pairTwo : pairOne;
    notices.push({
      severity: "info",
      title: "Próximo partido",
      message: `${schedule.time || schedule.turn}${nextMatch.court ? ` · Cancha ${nextMatch.court}` : ""} vs ${rival ? pairName(rival) : "pareja rival"}.`,
    });
  }
  const conflict = mySubmissions.find((submission) => submission.status === "conflicto");
  if (conflict) {
    notices.push({
      severity: "danger",
      title: "Resultado en conflicto",
      message: "Tu marcador no coincide con otro reporte. Revisa con la mesa.",
    });
  }
  const confirmed = mySubmissions.find((submission) => submission.status === "confirmado");
  if (confirmed) {
    notices.push({
      severity: "success",
      title: "Resultado confirmado",
      message: `Último marcador confirmado: ${confirmed.pair_one_score}-${confirmed.pair_two_score}.`,
    });
  }
  return notices.slice(0, 5);
}

function NoticeCenter({ title, notices, emptyText }) {
  return (
    <section className="notice-center">
      <div className="block-head">
        <h2><AlertCircle size={18} /> {title}</h2>
        <span>{notices.length} aviso{notices.length === 1 ? "" : "s"}</span>
      </div>
      {notices.length ? (
        <div className="notice-list">
          {notices.map((notice, index) => (
            <article className={`notice-card ${notice.severity}`} key={`${notice.title}-${index}`}>
              <strong>{notice.title}</strong>
              <span>{notice.message}</span>
            </article>
          ))}
        </div>
      ) : (
        <p className="notice-empty">{emptyText}</p>
      )}
    </section>
  );
}

function PlayerProfile({
  events,
  pairs,
  registrations = [],
  matches,
  resultSubmissions,
  standings,
  authUser,
  selectedEventId,
  setSelectedEventId,
  selectedEvent,
  loading,
  onSubmitResult,
  onRefresh,
  goRegister,
  goLogin,
}) {
  const [scores, setScores] = useState({});
  const pairById = useMemo(() => new Map(pairs.map((pair) => [pair.id, pair])), [pairs]);
  const myPair = authUser?.role === "jugador"
    ? pairs.find((pair) => pairHasUser(pair, authUser.id))
    : null;
  const myMatches = myPair
    ? matches
      .filter((match) => match.pair_one_id === myPair.id || match.pair_two_id === myPair.id)
      .sort((left, right) => minutesFromMatch(left) - minutesFromMatch(right) || left.id - right.id)
    : [];
  const completedMatches = myMatches.filter(matchHasResult);
  const pendingMatches = myMatches.filter((match) => !matchHasResult(match));
  const nextMatch = pendingMatches[0] || null;
  const myStanding = myPair ? standings.find((standing) => standing.pair_id === myPair.id) : null;
  const categoryStandings = myPair
    ? standings.filter((standing) => standing.pair.category === myPair.category)
    : [];
  const mySubmissions = resultSubmissions.filter((submission) => (
    myMatches.some((match) => match.id === submission.match_id)
    && submission.submitted_by_user_id === authUser?.id
  ));
  const latestSubmissionByMatch = new Map(mySubmissions.map((submission) => [submission.match_id, submission]));
  const matchScoreSeed = myMatches
    .map((match) => `${match.id}:${match.pair_one_score ?? ""}-${match.pair_two_score ?? ""}`)
    .join("|");
  const submissionScoreSeed = mySubmissions
    .map((submission) => `${submission.match_id}:${submission.pair_one_score}-${submission.pair_two_score}:${submission.status}`)
    .join("|");
  const progressPercent = myMatches.length ? Math.round((completedMatches.length / myMatches.length) * 100) : 0;
  const myResults = myPair ? completedMatches.map((match) => playerMatchOutcome(match, myPair.id, pairById)) : [];
  const myWins = myResults.filter((result) => result.result === "win").length;
  const myLosses = myResults.filter((result) => result.result === "loss").length;
  const bestWin = myResults
    .filter((result) => result.result === "win")
    .sort((left, right) => right.margin - left.margin)[0] || null;
  const closestMatch = myResults
    .sort((left, right) => left.absMargin - right.absMargin)[0] || null;
  const partnerName = myPair
    ? myPair.player_one?.user_id === authUser.id
      ? myPair.player_two?.name || "Buscando partner"
      : myPair.player_one?.name || "Partner"
    : "";
  const myRegistration = registrations?.find?.((registration) => registration.user_id === authUser.id) || null;
  const playerNotices = buildPlayerNotices({
    myPair,
    myRegistration,
    nextMatch,
    pairById,
    mySubmissions,
  });

  useEffect(() => {
    setScores(Object.fromEntries(myMatches.map((match) => {
      const submission = latestSubmissionByMatch.get(match.id);
      return [
        match.id,
        {
          pair_one_score: submission?.pair_one_score ?? match.pair_one_score ?? "",
          pair_two_score: submission?.pair_two_score ?? match.pair_two_score ?? "",
        },
      ];
    })));
  }, [matchScoreSeed, submissionScoreSeed, selectedEventId]);

  function setMatchScore(matchId, field, value) {
    setScores((current) => ({
      ...current,
      [matchId]: {
        pair_one_score: current[matchId]?.pair_one_score ?? "",
        pair_two_score: current[matchId]?.pair_two_score ?? "",
        [field]: value === "" ? "" : String(Math.max(0, Number(value || 0))),
      },
    }));
  }

  function submitMatch(matchId) {
    const current = scores[matchId] || {};
    if (current.pair_one_score === "" || current.pair_two_score === "") return;
    onSubmitResult(matchId, current.pair_one_score, current.pair_two_score);
  }

  if (!authUser) {
    return (
      <section className="player-page">
        <div className="player-hero">
          <p className="eyebrow">Perfil jugador</p>
          <h2>Entra para seguir tu evento</h2>
          <p>Tu tablero personal muestra partidos, resultados reportados y ranking en vivo.</p>
          <button type="button" onClick={goLogin}>Entrar a mi cuenta</button>
        </div>
      </section>
    );
  }

  if (authUser.role !== "jugador") {
    return <AccessDenied moduleName="Perfil jugador" />;
  }

  return (
    <section className="player-page">
      <div className="player-hero">
        <div>
          <p className="eyebrow">Perfil jugador</p>
          <h2>{authUser.name}</h2>
          <p>{authUser.category || "Sin categoría"} · {authUser.preferred_side || "lado indiferente"}{authUser.phone ? ` · ${authUser.phone}` : ""}</p>
        </div>
        <div className="player-event-picker">
          <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>
            <option value="">Seleccionar evento</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select>
          <button type="button" className="secondary-action" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={16} /> Actualizar
          </button>
        </div>
      </div>

      {selectedEvent && (
        <div className="player-live-strip">
          <div>
            <span>Evento</span>
            <strong>{selectedEvent.name}</strong>
            <small>{selectedEvent.date} · {selectedEvent.place} · {selectedEvent.schedule}</small>
          </div>
          <div>
            <span>Avance</span>
            <strong>{completedMatches.length}/{myMatches.length || 0}</strong>
            <small>{progressPercent}% de tus partidos jugados</small>
          </div>
          <div>
            <span>Ranking</span>
            <strong>{myStanding?.position ? `#${myStanding.position}` : "-"}</strong>
            <small>{myStanding ? `${myStanding.points} pts · dif ${myStanding.points_for - myStanding.points_against}` : "Aparece al iniciar el evento"}</small>
          </div>
        </div>
      )}

      <NoticeCenter title="Mis avisos" notices={playerNotices} emptyText="Sin avisos por ahora. Todo se ve tranquilo." />

      <PlayerIdentityCard
        authUser={authUser}
        selectedEvent={selectedEvent}
        myPair={myPair}
        partnerName={partnerName}
        myStanding={myStanding}
        wins={myWins}
        losses={myLosses}
      />

      {!selectedEventId ? (
        <div className="player-empty">
          <strong>Selecciona un evento activo</strong>
          <span>Cuando el evento tenga fixture, verás aquí tus turnos y marcadores.</span>
        </div>
      ) : !myPair ? (
        <div className="player-empty">
          <strong>No encontramos tu inscripción en este evento</strong>
          <span>Inscríbete o confirma que tu cuenta esté vinculada al jugador correcto.</span>
          <button type="button" onClick={goRegister}>Ir al registro</button>
        </div>
      ) : (
        <>
          <section className="player-grid">
            <article className="player-focus-card">
              <div className="player-card-head">
                <h2><Target size={18} /> Tu pareja</h2>
                <span>{myPair.category}</span>
              </div>
              <strong>{pairName(myPair)}</strong>
              <div className="player-progress-bar" aria-label="Avance de partidos">
                <span style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="player-stat-row">
                <span>{myStanding?.played || completedMatches.length} jugados</span>
                <span>{myStanding?.won || 0} ganados</span>
                <span>{myStanding?.lost || 0} perdidos</span>
              </div>
            </article>

            <article className="player-focus-card next">
              <div className="player-card-head">
                <h2><Clock size={18} /> Próximo partido</h2>
                <span>{nextMatch ? parseFixtureRoundLabel(nextMatch.round_name).time || parseFixtureRoundLabel(nextMatch.round_name).turn : "Sin pendientes"}</span>
              </div>
              {nextMatch ? (
                <MatchSummary match={nextMatch} pairById={pairById} myPairId={myPair.id} />
              ) : (
                <p className="empty">No tienes partidos pendientes en este evento.</p>
              )}
            </article>

            <article className="player-focus-card">
              <div className="player-card-head">
                <h2><Trophy size={18} /> Tu categoría</h2>
                <span>{categoryStandings.length} parejas</span>
              </div>
              <div className="player-mini-ranking">
                {categoryStandings.slice(0, 5).map((standing) => (
                  <div className={standing.pair_id === myPair.id ? "me" : ""} key={standing.id}>
                    <span>{standing.position}</span>
                    <strong>{pairName(standing.pair)}</strong>
                    <em>{standing.points} pts</em>
                  </div>
                ))}
                {!categoryStandings.length && <p className="empty">Ranking pendiente.</p>}
              </div>
            </article>
          </section>

          <PlayerEventSummary
            event={selectedEvent}
            myPair={myPair}
            myStanding={myStanding}
            myMatches={myMatches}
            myResults={myResults}
            bestWin={bestWin}
            closestMatch={closestMatch}
            progressPercent={progressPercent}
          />

          <section className="player-match-list">
            <div className="block-head">
              <h2><FileCheck2 size={18} /> Mis partidos</h2>
              <span>{pendingMatches.length} pendiente{pendingMatches.length === 1 ? "" : "s"}</span>
            </div>
            {myMatches.length ? myMatches.map((match) => (
              <PlayerMatchCard
                key={match.id}
                match={match}
                pairById={pairById}
                myPairId={myPair.id}
                submission={latestSubmissionByMatch.get(match.id)}
                score={scores[match.id] || { pair_one_score: "", pair_two_score: "" }}
                setScore={setMatchScore}
                onSubmit={submitMatch}
                loading={loading}
              />
            )) : (
              <div className="player-empty compact">
                <strong>Fixture pendiente</strong>
                <span>Cuando la organización genere los partidos, aparecerán aquí.</span>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function playerMatchOutcome(match, myPairId, pairById) {
  const isPairOne = match.pair_one_id === myPairId;
  const myScore = Number(isPairOne ? match.pair_one_score : match.pair_two_score);
  const rivalScore = Number(isPairOne ? match.pair_two_score : match.pair_one_score);
  const rivalPairId = isPairOne ? match.pair_two_id : match.pair_one_id;
  const rival = pairById.get(rivalPairId);
  const margin = myScore - rivalScore;
  return {
    absMargin: Math.abs(margin),
    margin,
    match,
    myScore,
    result: margin > 0 ? "win" : margin < 0 ? "loss" : "draw",
    rivalName: rival ? pairName(rival) : `Pareja ${rivalPairId}`,
    rivalScore,
  };
}

function PlayerIdentityCard({ authUser, selectedEvent, myPair, partnerName, myStanding, wins, losses }) {
  return (
    <section className="player-identity-card">
      <div className="player-avatar" aria-hidden="true">
        {authUser.name?.slice(0, 1).toUpperCase() || "A"}
      </div>
      <div className="player-identity-main">
        <span>Jugador AMAR</span>
        <strong>{authUser.name}</strong>
        <small>{authUser.email}</small>
      </div>
      <div className="player-identity-facts">
        <div>
          <span>Categoría</span>
          <strong>{authUser.category || myPair?.category || "-"}</strong>
        </div>
        <div>
          <span>Lado</span>
          <strong>{authUser.preferred_side || "indiferente"}</strong>
        </div>
        <div>
          <span>Partner</span>
          <strong>{partnerName || "Sin evento"}</strong>
        </div>
        <div>
          <span>Evento</span>
          <strong>{selectedEvent ? eventStatusLabels[selectedEvent.status] || "Activo" : "-"}</strong>
        </div>
        <div>
          <span>Registro</span>
          <strong>{myPair ? myPair.status === "completa" ? "Completo" : "Buscando" : "Pendiente"}</strong>
        </div>
        <div>
          <span>Balance</span>
          <strong>{wins}-{losses}</strong>
        </div>
        <div>
          <span>Posición</span>
          <strong>{myStanding?.position ? `#${myStanding.position}` : "-"}</strong>
        </div>
      </div>
    </section>
  );
}

function PlayerEventSummary({ event, myPair, myStanding, myMatches, myResults, bestWin, closestMatch, progressPercent }) {
  if (!myPair) return null;
  const played = myResults.length;
  const pointsDiff = myStanding ? myStanding.points_for - myStanding.points_against : myResults.reduce((total, result) => total + result.margin, 0);

  return (
    <section className="player-event-summary">
      <div className="block-head">
        <div>
          <h2><Medal size={18} /> Mi resumen del evento</h2>
          <p className="muted">{event?.name || "Evento seleccionado"}</p>
        </div>
        <span>{progressPercent}% completado</span>
      </div>
      <div className="player-summary-grid">
        <article>
          <span>Posición</span>
          <strong>{myStanding?.position ? `#${myStanding.position}` : "-"}</strong>
          <small>{myStanding ? `${myStanding.points} pts` : "Ranking pendiente"}</small>
        </article>
        <article>
          <span>Partidos</span>
          <strong>{played}/{myMatches.length}</strong>
          <small>{myStanding?.won ?? myResults.filter((result) => result.result === "win").length} victorias</small>
        </article>
        <article>
          <span>Diferencia</span>
          <strong>{pointsDiff > 0 ? `+${pointsDiff}` : pointsDiff}</strong>
          <small>juegos a favor/en contra</small>
        </article>
      </div>
      <div className="player-highlight-grid">
        <div>
          <span>Mejor victoria</span>
          {bestWin ? (
            <strong>{bestWin.myScore}-{bestWin.rivalScore} vs {bestWin.rivalName}</strong>
          ) : (
            <strong>Sin victorias cargadas</strong>
          )}
        </div>
        <div>
          <span>Partido más cerrado</span>
          {closestMatch ? (
            <strong>{closestMatch.myScore}-{closestMatch.rivalScore} vs {closestMatch.rivalName}</strong>
          ) : (
            <strong>Sin resultados cargados</strong>
          )}
        </div>
      </div>
    </section>
  );
}

function MatchSummary({ match, pairById, myPairId }) {
  const pairOne = pairById.get(match.pair_one_id);
  const pairTwo = pairById.get(match.pair_two_id);
  const schedule = parseFixtureRoundLabel(match.round_name);
  const rival = match.pair_one_id === myPairId ? pairTwo : pairOne;
  return (
    <div className="player-match-summary">
      <strong>vs {rival ? pairName(rival) : "Pareja rival"}</strong>
      <span>{schedule.group || schedule.turn}{match.court ? ` · Cancha ${match.court}` : ""}</span>
      {matchHasResult(match) && <em>{match.pair_one_score}-{match.pair_two_score}</em>}
    </div>
  );
}

function PlayerMatchCard({ match, pairById, myPairId, submission, score, setScore, onSubmit, loading }) {
  const pairOne = pairById.get(match.pair_one_id);
  const pairTwo = pairById.get(match.pair_two_id);
  const schedule = parseFixtureRoundLabel(match.round_name);
  const done = matchHasResult(match);
  const canSubmit = score.pair_one_score !== "" && score.pair_two_score !== "";
  const statusLabel = done
    ? "Oficial"
    : submission?.status === "conflicto"
      ? "En conflicto"
      : submission?.status === "confirmado"
        ? "Confirmado"
        : submission
          ? "Reportado"
          : "Pendiente";

  return (
    <article className={`player-match-card ${done ? "done" : ""} ${submission?.status || ""}`}>
      <div className="player-match-meta">
        <span>{schedule.time || schedule.turn}</span>
        <strong>{match.court ? `Cancha ${match.court}` : "Cancha por confirmar"}</strong>
        <em>{statusLabel}</em>
      </div>
      <div className="player-score-entry">
        <label className={match.pair_one_id === myPairId ? "mine" : ""}>
          <span>{pairOne ? pairName(pairOne) : "Pareja 1"}</span>
          <input
            type="number"
            min="0"
            value={score.pair_one_score}
            onChange={(event) => setScore(match.id, "pair_one_score", event.target.value)}
            disabled={done}
          />
        </label>
        <strong>vs</strong>
        <label className={match.pair_two_id === myPairId ? "mine" : ""}>
          <span>{pairTwo ? pairName(pairTwo) : "Pareja 2"}</span>
          <input
            type="number"
            min="0"
            value={score.pair_two_score}
            onChange={(event) => setScore(match.id, "pair_two_score", event.target.value)}
            disabled={done}
          />
        </label>
      </div>
      {submission && !done && (
        <div className={`player-submission-note ${submission.status}`}>
          Tu reporte: {submission.pair_one_score}-{submission.pair_two_score}
        </div>
      )}
      <button type="button" onClick={() => onSubmit(match.id)} disabled={done || !canSubmit || loading}>
        <FileCheck2 size={16} /> {done ? "Resultado oficial" : submission ? "Actualizar reporte" : "Reportar resultado"}
      </button>
    </article>
  );
}

function PartnerFinder({
  events,
  pairs,
  authUser,
  selectedEventId,
  setSelectedEventId,
  selectedEvent,
  loading,
  onJoinPair,
  goRegister,
  goSignup,
  goLogin,
}) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const searchingPairs = pairs.filter((pair) => pair.status === "buscando_partner" && !pair.player_two_id);
  const myPair = authUser?.role === "jugador" ? pairs.find((pair) => pairHasUser(pair, authUser.id)) : null;
  const categories = [...new Set(searchingPairs.map((pair) => pair.category).filter(Boolean))];
  const visiblePairs = searchingPairs.filter((pair) => categoryFilter === "all" || pair.category === categoryFilter);
  const needsAccount = authUser?.role !== "jugador";

  return (
    <section className="partners-page">
      <div className="partners-hero">
        <div>
          <p className="eyebrow">Comunidad AMAR</p>
          <h2>Busca partner para jugar</h2>
          <p>Encuentra jugadores inscritos que necesitan completar dupla en el evento activo.</p>
        </div>
        <div className="player-event-picker">
          <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>
            <option value="">Seleccionar evento</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select>
          <button type="button" className="secondary-action" onClick={goRegister}>Inscribirme solo</button>
        </div>
      </div>

      {needsAccount ? (
        <div className="player-empty">
          <strong>Necesitas una cuenta jugador</strong>
          <span>Crea tu perfil o entra con tu cuenta para unirte como partner.</span>
          <div className="modal-actions">
            <button type="button" onClick={goSignup}>Crear perfil</button>
            <button type="button" className="secondary-action" onClick={goLogin}>Entrar</button>
          </div>
        </div>
      ) : !selectedEvent ? (
        <div className="player-empty">
          <strong>Selecciona un evento</strong>
          <span>Verás las duplas que están buscando partner.</span>
        </div>
      ) : myPair ? (
        <div className="partner-current-card">
          <span>Ya tienes inscripción en este evento</span>
          <strong>{pairName(myPair)}</strong>
          <small>{myPair.category} · {myPair.status === "buscando_partner" ? "buscando partner" : "pareja completa"}</small>
        </div>
      ) : (
        <>
          <div className="partners-toolbar">
            <div>
              <strong>{visiblePairs.length}</strong>
              <span>jugador{visiblePairs.length === 1 ? "" : "es"} buscando partner</span>
            </div>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">Todas las categorías</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>

          <div className="partner-card-grid">
            {visiblePairs.length ? visiblePairs.map((pair) => (
              <article className="partner-card" key={pair.id}>
                <div className="partner-card-main">
                  <span>{pair.category}</span>
                  <strong>{pair.player_one.name}</strong>
                  <small>{pair.player_one.preferred_side || "lado indiferente"}{pair.player_one.phone ? ` · ${pair.player_one.phone}` : ""}</small>
                </div>
                <div className="partner-card-actions">
                  <button type="button" onClick={() => onJoinPair(pair.id)} disabled={loading}>
                    <Users size={16} /> Unirme como partner
                  </button>
                </div>
              </article>
            )) : (
              <div className="player-empty compact">
                <strong>No hay jugadores buscando partner</strong>
                <span>Puedes inscribirte solo para aparecer en esta lista.</span>
                <button type="button" onClick={goRegister}>Inscribirme solo</button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function PublicResults({
  events,
  pairs,
  matches,
  resultSubmissions,
  standings,
  ranking,
  authUser,
  selectedEventId,
  setSelectedEventId,
  selectedEvent,
  form,
  setForm,
  onSubmit,
  rankingConfig,
  setRankingConfig,
  onSaveRanking,
  onOfficialResult,
  onGenerateFinalFixture,
  onFinishEvent,
  onRefresh,
  loading,
  canEditScores,
  canManageEvent,
}) {
  if (authUser && authUser.role !== "jugador" && (canEditScores || canManageEvent)) {
    return (
      <ResultsControlCenter
        events={events}
        pairs={pairs}
        matches={matches}
        resultSubmissions={resultSubmissions}
        standings={standings}
        ranking={ranking}
        selectedEventId={selectedEventId}
        setSelectedEventId={setSelectedEventId}
        selectedEvent={selectedEvent}
        rankingConfig={rankingConfig}
        setRankingConfig={setRankingConfig}
        onSaveRanking={onSaveRanking}
        onOfficialResult={onOfficialResult}
        onGenerateFinalFixture={onGenerateFinalFixture}
        onFinishEvent={onFinishEvent}
        onRefresh={onRefresh}
        loading={loading}
        canEditScores={canEditScores}
        canManageEvent={canManageEvent}
      />
    );
  }

  const userMatches = authUser?.role === "jugador"
    ? matches.filter((match) => {
      const one = pairs.find((pair) => pair.id === match.pair_one_id);
      const two = pairs.find((pair) => pair.id === match.pair_two_id);
      return pairHasUser(one, authUser.id) || pairHasUser(two, authUser.id);
    })
    : [];
  const roundNames = [...new Set(userMatches.map((match) => match.round_name || "Grupo"))];
  const activeRound = form.round_name || roundNames[0] || "";
  const visibleMatches = activeRound ? userMatches.filter((match) => (match.round_name || "Grupo") === activeRound) : userMatches;
  const selectedMatch = visibleMatches.find((match) => match.id === Number(form.match_id));
  const selectedSubmission = selectedMatch ? resultSubmissions.find((submission) => submission.match_id === selectedMatch.id && submission.submitted_by_user_id === authUser?.id) : null;
  const pairOne = selectedMatch ? pairs.find((pair) => pair.id === selectedMatch.pair_one_id) : null;
  const pairTwo = selectedMatch ? pairs.find((pair) => pair.id === selectedMatch.pair_two_id) : null;
  const conflictCount = resultSubmissions.filter((submission) => submission.status === "conflicto").length;
  const standingsByCategory = standings.reduce((groups, standing) => {
    const category = standing.pair.category || "Sin categoria";
    groups[category] = [...(groups[category] || []), standing];
    return groups;
  }, {});

  return (
    <section className="public-page">
      <div className="public-hero results-hero">
        <p className="eyebrow">Carga de resultados</p>
        <h2>Anotar marcador del partido</h2>
        <p>Solo puedes reportar resultados de tus partidos. Si otro jugador reporta algo distinto, la mesa verá una alerta.</p>
      </div>

      <div className="public-grid">
        <aside className="panel">
          <h2><ExternalLink size={18} /> Evento</h2>
          <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)} required>
            <option value="">Seleccionar evento</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select>
          {selectedEvent && (
            <div className="event-ticket">
              <strong>{selectedEvent.name}</strong>
              <span>{selectedEvent.date}</span>
              <span>{selectedEvent.place}</span>
              <span>{selectedEvent.schedule}</span>
            </div>
          )}
        </aside>

        <section className="panel">
          <h2><FileCheck2 size={18} /> Resultado</h2>
          {authUser?.role !== "jugador" ? (
            <div className="result-state-card">
              <strong>Cuenta jugador requerida</strong>
              <span>Entra con tu cuenta jugador para reportar solo tus partidos.</span>
            </div>
          ) : !userMatches.length ? (
            <div className="result-state-card">
              <strong>Sin partidos asignados</strong>
              <span>No encontramos partidos vinculados a tu cuenta en este evento.</span>
            </div>
          ) : (
          <form onSubmit={onSubmit} className="score-form">
            <select
              value={activeRound}
              onChange={(e) => setForm({ ...form, round_name: e.target.value, match_id: "", pair_one_score: "", pair_two_score: "" })}
              required
            >
              {roundNames.length ? (
                roundNames.map((roundName, index) => (
                  <option key={roundName} value={roundName}>Ronda {index + 1}</option>
                ))
              ) : (
                <option value="">Sin rondas disponibles</option>
              )}
            </select>
            <select value={form.match_id} onChange={(e) => setForm({ ...form, match_id: e.target.value })} required>
              <option value="">Seleccionar partido</option>
              {visibleMatches.map((match) => {
                const one = pairs.find((pair) => pair.id === match.pair_one_id);
                const two = pairs.find((pair) => pair.id === match.pair_two_id);
                const label = `${one ? pairName(one) : `Pareja ${match.pair_one_id}`} vs ${two ? pairName(two) : `Pareja ${match.pair_two_id}`}`;
                return <option key={match.id} value={match.id}>{label}</option>;
              })}
            </select>

            {selectedMatch && (
              <>
              {selectedSubmission && (
                <div className={`result-state-card ${selectedSubmission.status}`}>
                  <strong>{selectedSubmission.status === "conflicto" ? "Resultado en conflicto" : selectedSubmission.status === "confirmado" ? "Resultado confirmado" : "Resultado pendiente"}</strong>
                  <span>Tu reporte: {selectedSubmission.pair_one_score}-{selectedSubmission.pair_two_score}</span>
                </div>
              )}
              <div className="scoreboard">
                <div>
                  <span>{pairOne ? pairName(pairOne) : "Pareja 1"}</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.pair_one_score}
                    onChange={(e) => setForm({ ...form, pair_one_score: e.target.value })}
                    required
                  />
                </div>
                <strong>VS</strong>
                <div>
                  <span>{pairTwo ? pairName(pairTwo) : "Pareja 2"}</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.pair_two_score}
                    onChange={(e) => setForm({ ...form, pair_two_score: e.target.value })}
                    required
                  />
                </div>
              </div>
              </>
            )}

            <button disabled={!selectedEventId || !form.match_id}><FileCheck2 size={16} /> Reportar resultado</button>
          </form>
          )}
        </section>
      </div>

      {conflictCount > 0 && (
        <div className="fixture-collision-alert">
          <strong>{conflictCount} alerta{conflictCount === 1 ? "" : "s"} de resultado</strong>
          <span>Hay reportes inconsistentes pendientes de revisión por mesa.</span>
        </div>
      )}

      <section className="panel">
        <h2><Medal size={18} /> Ranking por categoría</h2>
        <div className="ranking-grid">
          {Object.entries(standingsByCategory).length ? (
            Object.entries(standingsByCategory).map(([category, categoryStandings]) => (
              <article className="ranking-table" key={category}>
                <div className="ranking-title">
                  <strong>{category}</strong>
                  <span>{categoryStandings.length} parejas</span>
                </div>
                <div className="ranking-row ranking-header">
                  <span>#</span>
                  <span>Pareja</span>
                  <span>J</span>
                  <span>G</span>
                  <span>Pts</span>
                  <span>Dif</span>
                </div>
                {categoryStandings.map((standing) => (
                  <div className="ranking-row" key={standing.id}>
                    <span>{standing.position}</span>
                    <span>{pairName(standing.pair)}</span>
                    <span>{standing.played}</span>
                    <span>{standing.won}</span>
                    <span>{standing.points}</span>
                    <span>{standing.points_for - standing.points_against}</span>
                  </div>
                ))}
              </article>
            ))
          ) : (
            <p className="empty">El ranking aparecerá cuando existan parejas o resultados cargados.</p>
          )}
        </div>
      </section>
    </section>
  );
}

function ResultsControlCenter({
  events,
  pairs,
  matches,
  resultSubmissions,
  standings,
  ranking,
  selectedEventId,
  setSelectedEventId,
  selectedEvent,
  rankingConfig,
  setRankingConfig,
  onSaveRanking,
  onOfficialResult,
  onGenerateFinalFixture,
  onFinishEvent,
  onRefresh,
  loading,
  canEditScores,
  canManageEvent,
}) {
  const [activeView, setActiveView] = useState("scores");
  const [roundFilter, setRoundFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [scoreDrafts, setScoreDrafts] = useState({});
  const [showFinalFixture, setShowFinalFixture] = useState(false);
  const pairById = useMemo(() => new Map(pairs.map((pair) => [pair.id, pair])), [pairs]);
  const appliedRankingConfig = useMemo(
    () => ({ ...defaultRankingConfig, ...(selectedEvent?.ranking_config || {}) }),
    [selectedEvent?.id, selectedEvent?.ranking_config],
  );
  const finalFixturePlans = useMemo(
    () => computeRankingPlacementFixture({
      pairs,
      matches,
      standings,
      fixtureConfig: selectedEvent?.fixture_config || {},
    }),
    [pairs, matches, standings, selectedEvent?.fixture_config],
  );
  const finalRanking = useMemo(() => computeFinalRanking({ pairs, matches }), [pairs, matches]);
  const completedMatches = matches.filter(matchHasResult);
  const pendingMatches = matches.filter((match) => !matchHasResult(match));
  const conflictMatchIds = new Set(resultSubmissions.filter((item) => item.status === "conflicto").map((item) => item.match_id));
  const categories = [...new Set(pairs.map((pair) => pair.category).filter(Boolean))];
  const roundDetails = matches.reduce((items, match) => {
    const name = match.round_name || "Sin ronda";
    const roundMatch = name.match(/Ronda\s+(\d+)/i);
    const timeMatch = name.match(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/);
    const phase = name.split("-").map((part) => part.trim()).find((part) => /fase|semi|final/i.test(part)) || "Programación";
    const key = roundMatch ? `round-${roundMatch[1]}-${timeMatch?.[1] || ""}` : name;
    if (!items.some((item) => item.key === key)) {
      items.push({
        key,
        number: roundMatch ? Number(roundMatch[1]) : 999,
        phase,
        label: roundMatch ? `Ronda ${roundMatch[1]}${timeMatch ? ` · ${timeMatch[1]}–${timeMatch[2]}` : ""}` : name,
      });
    }
    return items;
  }, []).sort((left, right) => left.number - right.number || left.label.localeCompare(right.label));

  function matchRoundKey(match) {
    const name = match.round_name || "Sin ronda";
    const roundMatch = name.match(/Ronda\s+(\d+)/i);
    const timeMatch = name.match(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/);
    return roundMatch ? `round-${roundMatch[1]}-${timeMatch?.[1] || ""}` : name;
  }

  function matchesStatus(match) {
    if (conflictMatchIds.has(match.id)) return "conflict";
    return matchHasResult(match) ? "complete" : "pending";
  }

  const contextMatches = matches.filter((match) => {
    const pair = pairById.get(match.pair_one_id);
    return (roundFilter === "all" || matchRoundKey(match) === roundFilter)
      && (categoryFilter === "all" || pair?.category === categoryFilter);
  });
  const contextPendingCount = contextMatches.filter((match) => matchesStatus(match) === "pending").length;
  const contextCompleteCount = contextMatches.filter((match) => matchesStatus(match) === "complete").length;
  const contextConflictCount = contextMatches.filter((match) => matchesStatus(match) === "conflict").length;

  const visibleMatches = contextMatches.filter((match) => statusFilter === "all" || matchesStatus(match) === statusFilter);
  const visibleGroups = roundDetails
    .map((round) => ({ round, matches: visibleMatches.filter((match) => matchRoundKey(match) === round.key) }))
    .filter((group) => group.matches.length);
  const progress = matches.length ? Math.round((completedMatches.length / matches.length) * 100) : 0;

  useEffect(() => {
    setScoreDrafts(Object.fromEntries(matches.map((match) => [match.id, {
      one: match.pair_one_score ?? "",
      two: match.pair_two_score ?? "",
    }])));
  }, [matches]);

  useEffect(() => {
    setRankingConfig({ ...defaultRankingConfig, ...(selectedEvent?.ranking_config || {}) });
  }, [selectedEvent?.id]);

  function updateScore(matchId, side, value) {
    setScoreDrafts((current) => ({
      ...current,
      [matchId]: { ...(current[matchId] || { one: "", two: "" }), [side]: value },
    }));
  }

  function goToNextPending() {
    const next = matches.find((match) => !matchHasResult(match) && !conflictMatchIds.has(match.id));
    if (!next) return;
    const pair = pairById.get(next.pair_one_id);
    setCategoryFilter(pair?.category || "all");
    setRoundFilter(matchRoundKey(next));
    setStatusFilter("pending");
  }

  return (
    <section className="results-center">
      <header className="results-center-head">
        <div>
          <p className="eyebrow">Mesa de resultados</p>
          <h2>Cierre y clasificación del evento</h2>
          <span>Consolida marcadores, resuelve alertas y publica el resultado final.</span>
        </div>
        <div className="results-event-picker">
          <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>
            <option value="">Seleccionar evento</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.name}{isEventActive(event) ? "" : " · finalizado"}</option>)}
          </select>
          <button className="icon-button" type="button" onClick={onRefresh} disabled={loading} title="Actualizar resultados">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {!selectedEvent ? <div className="panel empty">Selecciona un evento para gestionar sus resultados.</div> : (
        <>
          <div className="results-kpis">
            <article><span>Progreso</span><strong>{completedMatches.length}/{matches.length}</strong><small>{progress}% cargado</small></article>
            <article className={pendingMatches.length ? "warning" : "success"}><span>Pendientes</span><strong>{pendingMatches.length}</strong><small>partidos sin cerrar</small></article>
            <article className={conflictMatchIds.size ? "danger" : "success"}><span>Conflictos</span><strong>{conflictMatchIds.size}</strong><small>requieren revisión</small></article>
            <article><span>Clasificación</span><strong>{categories.length}</strong><small>categorías activas</small></article>
          </div>

          <div className="results-progress" aria-label={`${progress}% de resultados cargados`}>
            <span style={{ width: `${progress}%` }} />
          </div>

          <nav className="results-tabs" aria-label="Gestión de resultados">
            <button className={activeView === "scores" ? "active" : ""} onClick={() => setActiveView("scores")}><FileCheck2 size={17} /> Marcadores</button>
            <button className={activeView === "ranking" ? "active" : ""} onClick={() => setActiveView("ranking")}><Medal size={17} /> Clasificación</button>
            <button className={activeView === "close" ? "active" : ""} onClick={() => setActiveView("close")}><Trophy size={17} /> Cierre</button>
          </nav>

          {activeView === "scores" && (
            <section className="results-score-workspace">
              <div className="results-category-tabs" role="group" aria-label="Filtrar por categoría">
                <button className={categoryFilter === "all" ? "active" : ""} type="button" onClick={() => setCategoryFilter("all")}>Todas <span>{matches.length}</span></button>
                {categories.map((category) => {
                  const count = matches.filter((match) => pairById.get(match.pair_one_id)?.category === category).length;
                  return <button className={categoryFilter === category ? "active" : ""} type="button" key={category} onClick={() => setCategoryFilter(category)}>{category} <span>{count}</span></button>;
                })}
              </div>
              <div className="results-filters">
                <select value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)}>
                  <option value="all">Todas las rondas</option>
                  {roundDetails.map((round) => <option key={round.key} value={round.key}>{round.label}</option>)}
                </select>
                <div className="results-status-filter" role="group" aria-label="Estado de los partidos">
                  <button type="button" className={statusFilter === "pending" ? "active" : ""} onClick={() => setStatusFilter("pending")}>Pendientes <span>{contextPendingCount}</span></button>
                  <button type="button" className={statusFilter === "complete" ? "active" : ""} onClick={() => setStatusFilter("complete")}>Cerrados <span>{contextCompleteCount}</span></button>
                  <button type="button" className={statusFilter === "conflict" ? "active danger" : ""} onClick={() => setStatusFilter("conflict")}>Conflictos <span>{contextConflictCount}</span></button>
                  <button type="button" className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>Todos</button>
                </div>
                <button className="secondary-action results-next-button" type="button" onClick={goToNextPending} disabled={!pendingMatches.length}>
                  <Target size={16} /> Siguiente pendiente
                </button>
              </div>
              <div className="results-match-list">
                {visibleGroups.map(({ round, matches: roundMatches }) => {
                  const fullRoundMatches = matches.filter((match) => matchRoundKey(match) === round.key && (categoryFilter === "all" || pairById.get(match.pair_one_id)?.category === categoryFilter));
                  const roundCompleted = fullRoundMatches.filter(matchHasResult).length;
                  return (
                  <section className="results-round-group" key={round.key}>
                    <header>
                      <div><strong>{round.label}</strong><span>{round.phase}</span></div>
                      <span>{roundCompleted}/{fullRoundMatches.length} cerrados</span>
                    </header>
                    <div className="results-round-matches">
                    {roundMatches.map((match) => {
                  const pairOne = pairById.get(match.pair_one_id);
                  const pairTwo = pairById.get(match.pair_two_id);
                  const draft = scoreDrafts[match.id] || { one: "", two: "" };
                  const hasChanges = String(draft.one) !== String(match.pair_one_score ?? "") || String(draft.two) !== String(match.pair_two_score ?? "");
                  const isComplete = matchHasResult(match);
                  return (
                    <article className={`results-match-row ${conflictMatchIds.has(match.id) ? "conflict" : isComplete ? "complete" : "pending"}`} key={match.id}>
                      <div className="results-match-meta">
                        <strong>{pairOne?.category || "Sin categoría"}{conflictMatchIds.has(match.id) ? " · Conflicto" : ""}</strong>
                        <span>Cancha {match.court || "-"}{/Tiebreak a 7/i.test(match.round_name || "") ? " · Tiebreak a 7" : ""}</span>
                      </div>
                      <div className="results-team"><strong>{pairOne ? pairName(pairOne) : `Pareja ${match.pair_one_id}`}</strong></div>
                      <input disabled={!canEditScores} aria-label={`Puntaje de ${pairOne ? pairName(pairOne) : "pareja 1"}`} type="number" min="0" value={draft.one} onChange={(event) => updateScore(match.id, "one", event.target.value)} />
                      <span className="results-score-separator">-</span>
                      <input disabled={!canEditScores} aria-label={`Puntaje de ${pairTwo ? pairName(pairTwo) : "pareja 2"}`} type="number" min="0" value={draft.two} onChange={(event) => updateScore(match.id, "two", event.target.value)} />
                      <div className="results-team second"><strong>{pairTwo ? pairName(pairTwo) : `Pareja ${match.pair_two_id}`}</strong></div>
                      <button
                        type="button"
                        className={hasChanges || !isComplete ? "" : "secondary-action"}
                        disabled={!canEditScores || draft.one === "" || draft.two === "" || loading || (!hasChanges && isComplete)}
                        onClick={() => onOfficialResult(match.id, draft.one, draft.two)}
                        title={isComplete ? "Actualizar resultado oficial" : "Guardar resultado oficial"}
                        aria-label={isComplete ? "Actualizar resultado oficial" : "Guardar resultado oficial"}
                      >
                        <Save size={16} />
                      </button>
                    </article>
                  );
                    })}
                    </div>
                  </section>
                  );
                })}
                {!visibleGroups.length && (
                  <div className="results-empty-state">
                    <Check size={22} />
                    <strong>No hay partidos con estos filtros</strong>
                    <span>{statusFilter === "pending" ? "Los partidos seleccionados ya están cerrados." : "Prueba otra ronda, categoría o estado."}</span>
                    <button type="button" className="secondary-action" onClick={() => { setRoundFilter("all"); setCategoryFilter("all"); setStatusFilter("all"); }}>Ver todos</button>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeView === "ranking" && (
            <div className="ranking-section results-ranking-section">
              {canManageEvent && <RankingConfigPanel config={rankingConfig} setConfig={setRankingConfig} onSave={onSaveRanking} />}
              <RankingFormulaPanel config={appliedRankingConfig} />
              <RankingBlock ranking={ranking} standings={standings} matches={matches} pairs={pairs} detailed />
              <RankingExplanation standings={standings} config={appliedRankingConfig} />
              {canManageEvent && (
                <FinalFixturePanel
                  plans={finalFixturePlans}
                  pairs={pairs}
                  expanded={showFinalFixture}
                  setExpanded={setShowFinalFixture}
                  loading={loading}
                  onGenerate={onGenerateFinalFixture}
                />
              )}
              <FinalRankingBlock categories={finalRanking} />
            </div>
          )}

          {activeView === "close" && (
            <div className="results-close-section">
              <PostEventSummary event={selectedEvent} standings={standings} matches={matches} pairs={pairs} />
              <article className={`event-close-card ${pendingMatches.length || conflictMatchIds.size ? "warning" : "ready"}`}>
                <div>
                  <span>{pendingMatches.length || conflictMatchIds.size ? "Revisión recomendada" : "Evento listo para cerrar"}</span>
                  <strong>{pendingMatches.length ? `${pendingMatches.length} resultados pendientes` : "Todos los partidos tienen resultado"}</strong>
                  <small>{conflictMatchIds.size ? `${conflictMatchIds.size} conflicto(s) por resolver.` : "No hay conflictos abiertos."}</small>
                </div>
                {canManageEvent && (
                  <button type="button" onClick={onFinishEvent} disabled={loading || selectedEvent.status === "finished"}>
                    <Trophy size={17} /> {selectedEvent.status === "finished" ? "Evento finalizado" : "Finalizar evento"}
                  </button>
                )}
              </article>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function EventsPage(props) {
  const [eventTab, setEventTab] = useState("event");
  const [showClosedEvents, setShowClosedEvents] = useState(false);
  const [fixtureSaveState, setFixtureSaveState] = useState("idle");
  const {
    events,
    players,
    members,
    pairs,
    payments,
    registrations,
    matches,
    resultSubmissions = [],
    standings,
    ranking,
    selectedEvent,
    selectedEventId,
    setSelectedEventId,
    eventForm,
    setEventForm,
    playerForm,
    setPlayerForm,
    pairForm,
    setPairForm,
    matchForm,
    setMatchForm,
    fixtureForm,
    setFixtureForm,
    resultForm,
    setResultForm,
    rankingConfigForm,
    setRankingConfigForm,
    whatsapp,
    submitEvent,
    submitPlayer,
    submitPair,
    submitMatch,
    submitGenerateFixture,
    submitGenerateBracket,
    submitRankingConfig,
    deleteSelectedEvent,
    closeSelectedEvent,
    activateSelectedEvent,
    closePastEvents,
    updateRegistration,
    confirmAction,
    authUser,
    run,
    forcedTab,
  } = props;
  const activeEventTab = forcedTab || eventTab;
  const fixtureConfig = { ...defaultFixtureConfig, ...(fixtureForm || {}) };
  const fixtureConfigKey = JSON.stringify(fixtureConfig);
  const storedFixtureConfigKey = JSON.stringify({ ...defaultFixtureConfig, ...(selectedEvent?.fixture_config || {}) });
  const visibleEvents = showClosedEvents ? events : events.filter(isEventActive);
  const pastActiveCount = events.filter((event) => isEventActive(event) && isPastEvent(event)).length;
  const completePairsCount = pairs.filter((pair) => pair.status === "completa" && pair.player_two_id).length;
  const categoriesWithFinals = new Set(
    pairs
      .filter((pair) => pair.status === "completa" && pair.player_two_id)
      .map((pair) => pair.category)
  ).size;
  const finalMatches = categoriesWithFinals * 2;
  const estimatedMatches = Math.ceil((completePairsCount * Number(fixtureForm.guaranteed_matches || 0)) / 2);
  const estimatedMatchesWithFinals = estimatedMatches + finalMatches;
  const fixtureTiming = deriveFixtureTiming(selectedEvent?.schedule || eventForm.schedule, Number(fixtureForm.warmup_minutes || 0));
  const slotsPerCourt = Math.max(1, Math.floor(Number(fixtureTiming.rentalMinutes || 0) / Number(fixtureForm.set_minutes || 1)));
  const recommendedCourts = estimatedMatches ? Math.ceil(estimatedMatches / slotsPerCourt) : 0;
  const recommendedCourtsWithFinals = estimatedMatchesWithFinals ? Math.ceil(estimatedMatchesWithFinals / slotsPerCourt) : 0;
  const configuredCourts = Number(fixtureForm.court_count || 0);
  const playerOptions = mergePlayersFromPairs(players, pairs);
  const participantOptions = mergeParticipantOptions(players, pairs, members || []);

  function startNewEvent() {
    setSelectedEventId("");
    setEventForm({ ...emptyEvent });
    setRankingConfigForm({ ...defaultRankingConfig });
    if (!forcedTab) setEventTab("event");
  }

  useEffect(() => {
    if (!selectedEvent) return;
    setEventForm({
      name: selectedEvent.name || "",
      date: selectedEvent.date || "",
      place: selectedEvent.place || "",
      categories: selectedEvent.categories || "",
      price: selectedEvent.price ?? 0,
      schedule: selectedEvent.schedule || "",
      capacity: selectedEvent.capacity ?? 16,
      tournament_type: selectedEvent.tournament_type || "Americano",
      category_configs: selectedEvent.category_configs || [],
      ranking_config: selectedEvent.ranking_config || {},
      fixture_config: selectedEvent.fixture_config || {},
      description: selectedEvent.description || "",
      is_active: selectedEvent.is_active ?? true,
      status: selectedEvent.status || "registration_open",
    });
    setRankingConfigForm({ ...defaultRankingConfig, ...(selectedEvent.ranking_config || {}) });
    setFixtureForm({ ...defaultFixtureConfig, ...(selectedEvent.fixture_config || {}) });
  }, [selectedEvent?.id]);

  useEffect(() => {
    setEventForm((current) => ({ ...current, fixture_config: fixtureConfig }));
    if (!selectedEventId || !selectedEvent || fixtureConfigKey === storedFixtureConfigKey) {
      if (fixtureSaveState === "saving") setFixtureSaveState("saved");
      return undefined;
    }
    setFixtureSaveState("saving");
    const timeout = window.setTimeout(() => {
      api.updateEvent(selectedEventId, { fixture_config: fixtureConfig })
        .then(() => setFixtureSaveState("saved"))
        .catch(() => setFixtureSaveState("error"));
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [selectedEventId, selectedEvent?.id, fixtureConfigKey, storedFixtureConfigKey]);

  return (
    <section className="workspace">
      <section className="panel main-panel">
        <div className="section-head">
          <h2>{forcedTab === "matches" ? <Swords size={18} /> : <ListChecks size={18} />} {forcedTab === "matches" ? "Partidos" : "Operación del evento"}</h2>
          <div className="event-picker">
            {!forcedTab && <button type="button" className="secondary-action" onClick={startNewEvent}>
              <CalendarPlus size={16} /> Nuevo evento
            </button>}
            {!forcedTab && <button type="button" className="danger-action event-picker-action" onClick={deleteSelectedEvent} disabled={!selectedEventId}>
              Eliminar
            </button>}
            {!forcedTab && <label className="event-history-toggle">
              <input
                type="checkbox"
                checked={showClosedEvents}
                onChange={(event) => setShowClosedEvents(event.target.checked)}
              />
              <span>Ver cerrados</span>
            </label>}
            <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
              <option value="">Seleccionar evento</option>
              {visibleEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}{isEventActive(event) ? "" : " (cerrado)"}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedEvent ? (
          <>
            <div className="event-summary">
              <strong>{selectedEvent.name}</strong>
              <span>{selectedEvent.date} - {selectedEvent.place} - {selectedEvent.categories}</span>
              <em>{eventStatusLabels[selectedEvent.status] || "Inscripción abierta"}</em>
              {!isEventActive(selectedEvent) && <em>Evento cerrado</em>}
            </div>

            {!forcedTab && <div className="event-tabs">
              <button className={eventTab === "event" ? "active" : ""} onClick={() => setEventTab("event")}>Evento</button>
              <button className={eventTab === "organization" ? "active" : ""} onClick={() => setEventTab("organization")}>Organización</button>
              <button className={eventTab === "payments" ? "active" : ""} onClick={() => setEventTab("payments")}>Pagos</button>
            </div>}

            {activeEventTab === "event" && (
              <div className="organization-section">
                <EventForm form={eventForm} setForm={setEventForm} onSubmit={submitEvent} isEditing={Boolean(selectedEventId)} />
                <EventWhatsappBlock whatsapp={whatsapp} draftEvent={eventForm} />
                <div className="danger-zone archive-zone">
                  <div>
                    <strong>Estado del evento</strong>
                    <span>
                      {selectedEvent && isEventActive(selectedEvent)
                        ? "Evento activo: aparece en Registro, Resultados y selectores operativos."
                        : "Evento cerrado: no aparece en Registro, Resultados ni selectores operativos."}
                    </span>
                  </div>
                  <div className="danger-actions">
                    <button type="button" className="secondary-action" onClick={closePastEvents} disabled={!pastActiveCount}>
                      Cerrar pasados ({pastActiveCount})
                    </button>
                    {selectedEvent && isEventActive(selectedEvent) ? (
                      <button type="button" className="secondary-action" onClick={closeSelectedEvent}>
                        Cerrar este evento
                      </button>
                    ) : (
                      <button type="button" className="secondary-action" onClick={activateSelectedEvent} disabled={!selectedEvent}>
                        <Check size={16} /> Activar evento
                      </button>
                    )}
                  </div>
                </div>
                <div className="danger-zone">
                  <div>
                    <strong>Eliminar evento</strong>
                    <span>Borra parejas, pagos, partidos, resultados y ranking asociados.</span>
                  </div>
                  <button type="button" className="danger-action" onClick={deleteSelectedEvent}>
                    Eliminar evento
                  </button>
                </div>
              </div>
            )}

            {activeEventTab === "organization" && (
            <>
            <OperationsStatus
              pairs={pairs}
              payments={payments}
              registrations={registrations}
              matches={matches}
            />
            <OrganizationReadiness
              pairs={pairs}
              payments={payments}
              registrations={registrations}
              matches={matches}
            />
            <CheckInBlock
              registrations={registrations}
              selectedEventId={selectedEventId}
              onUpdateRegistration={updateRegistration}
            />
            <PartnerMatchingBlock
              pairs={pairs}
              participantOptions={participantOptions}
              eventId={selectedEventId}
              onChange={run}
            />
            <div className="data-grid">
                  <PairsBlock
                    pairs={pairs}
                    participantOptions={participantOptions}
                    payments={payments}
                    registrations={registrations}
                    eventId={selectedEventId}
                    onChange={run}
                    confirmAction={confirmAction}
                  />
            </div>

            </>
            )}

            {activeEventTab === "matches" && (
            <div className="organization-section">
              <div className="data-block fixture-card">
                <div className="block-head">
                  <h3><Swords size={16} /> Partidos</h3>
                </div>
                <TournamentSetupPanel
                  selectedEvent={selectedEvent}
                  pairs={pairs}
                  registrations={registrations}
                  matches={matches}
                  fixtureForm={fixtureForm}
                  setFixtureForm={setFixtureForm}
                  fixtureTiming={fixtureTiming}
                  configuredCourts={configuredCourts}
                />
              </div>
            </div>
            )}

            {activeEventTab === "payments" && (
              <div className="payments-grid">
                <PaymentBlock payments={payments} pairs={pairs} players={players} eventId={selectedEventId} onChange={run} />
                <div className="data-block">
                  <h3><Clipboard size={16} /> WhatsApp</h3>
                  <textarea className="whatsapp" value={whatsapp} readOnly />
                </div>
              </div>
            )}

          </>
        ) : (
          <div className="organization-section">
            <p className="empty">No hay eventos cargados todavía. Crea el primero para comenzar.</p>
            <EventForm form={eventForm} setForm={setEventForm} onSubmit={submitEvent} isEditing={false} />
            <EventWhatsappBlock whatsapp={whatsapp} draftEvent={eventForm} />
          </div>
        )}
      </section>
    </section>
  );
}

function OperationsStatus({ pairs, payments, registrations, matches }) {
  const confirmedRegistrations = registrations.filter((registration) => registration.status !== "lista_espera" && registration.status !== "cancelada");
  const checkedInCount = confirmedRegistrations.filter((registration) => registration.checked_in).length;
  const incompletePairs = pairs.filter((pair) => pair.status === "buscando_partner" || !pair.player_two_id).length;
  const pendingPayments = payments.filter((payment) => payment.status !== "pagado").length;
  const pendingMatches = matches.filter((match) => !matchHasResult(match)).length;
  const cards = [
    {
      label: "Check-in",
      value: `${checkedInCount}/${confirmedRegistrations.length}`,
      state: confirmedRegistrations.length && checkedInCount === confirmedRegistrations.length ? "ok" : "watch",
    },
    {
      label: "Parejas incompletas",
      value: incompletePairs,
      state: incompletePairs ? "warning" : "ok",
    },
    {
      label: "Pagos pendientes",
      value: pendingPayments,
      state: pendingPayments ? "watch" : "ok",
    },
    {
      label: "Partidos pendientes",
      value: pendingMatches,
      state: pendingMatches ? "watch" : "ok",
    },
  ];

  return (
    <section className="operations-status">
      {cards.map((card) => (
        <article className={card.state} key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </article>
      ))}
    </section>
  );
}

function TournamentSetupPanel({ selectedEvent, pairs, registrations = [], matches, fixtureForm, setFixtureForm, fixtureTiming, configuredCourts }) {
  const categories = matchCategoryPlans(pairs);
  const scheduledRows = scheduledMatchRows(matches, pairs).filter((row) => row.time || row.turn);
  const scheduledStartMinutes = scheduledRows.map((row) => minutesFromSlot(row.time || row.turn)).filter((minutes) => minutes !== 9999);
  const scheduledEndMinutes = scheduledRows.map((row) => slotEndMinutes(row.time || row.turn)).filter(Boolean);
  const scheduledStart = scheduledStartMinutes.length ? Math.min(...scheduledStartMinutes) : null;
  const scheduledEnd = scheduledEndMinutes.length ? Math.max(...scheduledEndMinutes) : null;
  const scheduledCourts = [...new Set(scheduledRows.map((row) => row.court).filter(Boolean))];
  const displayedStart = scheduledStart !== null && Number.isFinite(scheduledStart) ? minutesToTime(scheduledStart) : (fixtureForm.start_time || fixtureTiming.fixtureStart || "");
  const displayedEnd = scheduledEnd ? minutesToTime(scheduledEnd) : (fixtureTiming.eventEnd || "");
  const effectiveMinutes = Number(fixtureForm.set_minutes || 20);
  const availableTurns = Math.max(1, Math.floor(Number(fixtureTiming.rentalMinutes || 0) / Math.max(1, effectiveMinutes)));
  const expectedPairsFromCapacity = Math.ceil(Number(selectedEvent?.capacity || 0) / 2);
  const completePairs = pairs.filter((pair) => pair.status === "completa" && pair.player_two_id).length;
  const planningPairs = Math.max(completePairs, expectedPairsFromCapacity);
  const guaranteedMatches = Math.ceil((planningPairs * Number(fixtureForm.guaranteed_matches || 1)) / 2);
  const finalMatches = Number(fixtureForm.include_finals || 0) ? Math.max(0, categories.length * 2) : 0;
  const totalMatchesToPlan = guaranteedMatches + finalMatches;
  const recommendedCourts = Math.max(1, Math.ceil(totalMatchesToPlan / availableTurns));
  const courtDelta = Math.max(0, recommendedCourts - Number(configuredCourts || 0));
  const format = fixtureForm.mode || "manual_groups";

  function update(patch) {
    setFixtureForm({ ...fixtureForm, ...patch });
  }

  return (
    <section className="tournament-setup">
      <div className="tournament-setup-head">
        <div>
          <span>Configuración del torneo</span>
          <strong>{displayedStart && displayedEnd ? `${displayedStart}-${displayedEnd} · ${availableTurns} turnos útiles` : "Horario pendiente"}</strong>
        </div>
        <div className={courtDelta ? "setup-pill warning" : "setup-pill ok"}>
          Pedir {recommendedCourts} cancha{recommendedCourts === 1 ? "" : "s"}
        </div>
      </div>

      <div className="setup-kpi-grid">
        <article>
          <span>Programación actual</span>
          <strong>{scheduledRows.length ? `${scheduledRows.length} partidos` : "Sin partidos"}</strong>
          <small>{scheduledRows.length ? `${scheduledCourts.length} canchas usadas` : "El planner llenará este dato."}</small>
        </article>
        <article>
          <span>Cupos del evento</span>
          <strong>{selectedEvent?.capacity || 0} jugadores</strong>
          <small>{planningPairs} parejas estimadas para cálculo.</small>
        </article>
        <article className={courtDelta ? "warning" : "ok"}>
          <span>Capacidad sugerida</span>
          <strong>{recommendedCourts} cancha{recommendedCourts === 1 ? "" : "s"}</strong>
          <small>{courtDelta ? `Faltan ${courtDelta} según configuración actual.` : "La configuración alcanza."}</small>
        </article>
      </div>

      <div className="tournament-setup-grid">
        <label className="form-field">
          <span>Formato</span>
          <select value={format} onChange={(event) => update({ mode: event.target.value })}>
            <option value="manual_groups">Manual por grupos</option>
            <option value="americano_inteligente">Americano inteligente</option>
            <option value="round_robin">Todos contra todos</option>
            <option value="groups_finals">Grupos + finales</option>
            <option value="timed_battles">Batallas por nivel</option>
            <option value="bracket">Eliminación directa</option>
          </select>
        </label>
        <label className="form-field">
          <span>Inicio partidos</span>
          <input value={displayedStart || "17:00"} onChange={(event) => update({ start_time: event.target.value })} readOnly={Boolean(scheduledRows.length)} />
        </label>
        <label className="form-field">
          <span>Fin estimado</span>
          <input value={displayedEnd || ""} readOnly />
        </label>
        <label className="form-field">
          <span>Minutos partido</span>
          <input type="number" min="1" value={fixtureForm.set_minutes} onChange={(event) => update({ set_minutes: event.target.value })} />
        </label>
        <label className="form-field">
          <span>Paleteo</span>
          <select value={fixtureForm.warmup_minutes} onChange={(event) => update({ warmup_minutes: event.target.value })}>
            <option value="0">Sin paleteo</option>
            <option value="5">5 minutos</option>
            <option value="10">10 minutos</option>
            <option value="15">15 minutos</option>
          </select>
        </label>
        <label className="form-field">
          <span>Canchas</span>
          <input value={fixtureForm.courts} onChange={(event) => {
            const courts = parseCourtList(event.target.value);
            update({ courts: event.target.value, court_count: courts.length, planner_courts: courts.join(", ") });
          }} />
        </label>
        <label className="form-field">
          <span>Parejas/grupo</span>
          <input type="number" min="2" value={fixtureForm.group_size} onChange={(event) => update({ group_size: event.target.value })} />
        </label>
        <label className="form-field">
          <span>Garantizados</span>
          <input type="number" min="1" value={fixtureForm.guaranteed_matches} onChange={(event) => update({ guaranteed_matches: event.target.value })} />
        </label>
        <label className="form-field">
          <span>Criterio visual</span>
          <select value={fixtureForm.balance_mode || "level"} onChange={(event) => update({ balance_mode: event.target.value })}>
            <option value="level">Nivel de dupla</option>
            <option value="seed">Orden de inscripción</option>
            <option value="manual">Manual</option>
          </select>
        </label>
      </div>

      <div className="setup-category-grid">
        {categories.map((category) => {
          const minimumTurns = category.courtsPerRound ? category.roundCount : 0;
          const capacityOk = !minimumTurns || availableTurns >= minimumTurns;
          return (
            <article className={capacityOk ? "ok" : "warning"} key={category.category}>
              <strong>{category.category}</strong>
              <span>{category.pairCount} parejas · {category.totalMatches} cruces</span>
              <small>{category.roundCount} rondas · {category.courtsPerRound} canchas simultáneas · nivel {pairLevelLabel(category.minLevel)}-{pairLevelLabel(category.maxLevel)}</small>
            </article>
          );
        })}
      </div>

      {format === "americano_inteligente" && (
        <AmericanoInteligentePanel
          pairs={pairs}
          registrations={registrations}
          fixtureForm={fixtureForm}
          fixtureTiming={fixtureTiming}
          configuredCourts={configuredCourts}
        />
      )}
    </section>
  );
}

function AmericanoInteligentePanel({ pairs, fixtureForm, fixtureTiming, configuredCourts }) {
  const fixedPairs = useMemo(() => americanoFixedPairs(pairs), [pairs]);
  const courts = useMemo(() => parseCourtList(fixtureForm.courts).slice(0, Math.max(1, Number(configuredCourts || fixtureForm.court_count || 1))), [fixtureForm.courts, fixtureForm.court_count, configuredCourts]);
  const preview = useMemo(() => generateFixedPairAmericanoFixture({
    pairs: fixedPairs,
    startTime: fixtureTiming.fixtureStart || fixtureForm.start_time,
    endTime: fixtureTiming.eventEnd,
    matchMinutes: Number(fixtureForm.set_minutes || 20),
    courts,
  }), [fixedPairs, fixtureTiming.fixtureStart, fixtureTiming.eventEnd, fixtureForm.start_time, fixtureForm.set_minutes, courts]);
  const printableCategories = useMemo(() => (
    [...new Set(preview.matches.flatMap((match) => [match.pair_one.category, match.pair_two.category]).filter(Boolean))]
      .sort((left, right) => String(left).localeCompare(String(right), undefined, { numeric: true }))
  ), [preview.matches]);

  return (
    <section className="americano-panel">
      <div className="americano-head">
        <div>
          <span>Motor Americano Inteligente</span>
          <strong>{preview.summary}</strong>
          <p>Duplas fijas durante todo el evento, descansos rotativos y cruces diversos entre parejas.</p>
        </div>
        <div className={preview.warnings.length ? "setup-pill warning" : "setup-pill ok"}>
          {preview.warnings.length ? `${preview.warnings.length} ajuste${preview.warnings.length === 1 ? "" : "s"}` : "Listo para simular"}
        </div>
      </div>

      <div className="americano-metrics">
        <article>
          <span>Parejas</span>
          <strong>{fixedPairs.length}</strong>
          <small>{preview.restPerRound} pareja{preview.restPerRound === 1 ? "" : "s"} descansan por ronda</small>
        </article>
        <article>
          <span>Rondas útiles</span>
          <strong>{preview.rounds.length}</strong>
          <small>{preview.timeWindow}</small>
        </article>
        <article>
          <span>Partidos</span>
          <strong>{preview.matches.length}</strong>
          <small>{preview.matchesPerPairRange}</small>
        </article>
        <article>
          <span>Diversidad</span>
          <strong>{preview.repeatSummary}</strong>
          <small>Cruces repetidos entre duplas</small>
        </article>
      </div>

      {preview.warnings.length > 0 && (
        <div className="americano-warnings">
          {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}

      {printableCategories.length > 0 && (
        <div className="americano-print-actions">
          <span>Imprimir programación</span>
          {printableCategories.map((category) => (
            <button
              type="button"
              className="secondary-action"
              key={`print-${category}`}
              onClick={() => printAmericanoCategory(category, preview)}
            >
              Imprimir {category}
            </button>
          ))}
        </div>
      )}

      <div className="americano-rounds">
        {preview.rounds.length ? preview.rounds.map((round) => (
          <article className="americano-round" key={`americano-r${round.round}`}>
            <header>
              <strong>R{round.round}</strong>
              <span>{round.start_time}-{round.end_time}</span>
              {round.resting.length > 0 && <small>Descansan: {round.resting.map((pair) => pair.shortName).join(", ")}</small>}
            </header>
            <div className="americano-match-grid">
              {round.matches.map((match) => (
                <div className="americano-match" key={`americano-r${round.round}-c${match.court}`}>
                  <span>Cancha {match.court}</span>
                  <AmericanoPairPill pair={match.pair_one} />
                  <b>vs</b>
                  <AmericanoPairPill pair={match.pair_two} />
                </div>
              ))}
            </div>
          </article>
        )) : (
          <p className="empty">Faltan al menos 2 parejas completas para generar un Americano.</p>
        )}
      </div>

      {preview.pairStats.length > 0 && (
        <div className="americano-table-wrap">
          <table className="americano-table">
            <thead>
              <tr>
                <th>Pareja</th>
                <th>Categoría</th>
                <th>Partidos</th>
                <th>Descansos</th>
                <th>Rivales</th>
              </tr>
            </thead>
            <tbody>
              {preview.pairStats.map((stat) => (
                <tr key={stat.id}>
                  <td>{stat.name}</td>
                  <td>{stat.category}</td>
                  <td>{stat.matches}</td>
                  <td>{stat.rests}</td>
                  <td>{stat.rivals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="americano-note">Preview local: este formato ya respeta parejas fijas; el siguiente paso es guardar estos cruces como partidos reales.</p>
    </section>
  );
}

function AmericanoPairPill({ pair }) {
  return (
    <div className="americano-pair-pill" style={{ "--pair-bg": pair.color }}>
      <strong>{pair.shortName}</strong>
      <small>{pair.category}</small>
    </div>
  );
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function printAmericanoCategory(category, preview) {
  const categoryRounds = preview.rounds
    .map((round) => ({
      ...round,
      matches: round.matches.filter((match) => match.pair_one.category === category || match.pair_two.category === category),
      resting: round.resting.filter((pair) => pair.category === category),
    }))
    .filter((round) => round.matches.length || round.resting.length);
  const categoryMatchCount = categoryRounds.reduce((sum, round) => sum + round.matches.length, 0);
  const maxMatchesInRound = Math.max(1, ...categoryRounds.map((round) => round.matches.length));
  const printColumns = Math.min(5, Math.max(2, maxMatchesInRound));
  const densityClass = categoryMatchCount > 24 ? "dense" : categoryMatchCount > 15 ? "compact" : "";

  const rows = categoryRounds.map((round) => `
    <section class="round">
      <header>
        <strong>R${round.round}</strong>
        <span>${htmlEscape(round.start_time)}-${htmlEscape(round.end_time)}</span>
        ${round.resting.length ? `<small>Descansan: ${round.resting.map((pair) => htmlEscape(pair.shortName)).join(", ")}</small>` : ""}
      </header>
      <div class="matches">
        ${round.matches.map((match) => `
          <article class="match">
            <span>Cancha ${htmlEscape(match.court)}</span>
            <div class="score-line">
              <div class="pair" style="background:${htmlEscape(match.pair_one.color)}">${htmlEscape(match.pair_one.shortName)}</div>
              <i></i>
            </div>
            <b>vs</b>
            <div class="score-line">
              <div class="pair" style="background:${htmlEscape(match.pair_two.color)}">${htmlEscape(match.pair_two.shortName)}</div>
              <i></i>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `).join("");

  const printWindow = window.open("", "_blank", "width=1100,height=800");
  if (!printWindow) {
    window.print();
    return;
  }
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Programación ${htmlEscape(category)}</title>
        <style>
          @page { size: A4 landscape; margin: 7mm; }
          * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          body { --print-cols: ${printColumns}; color: #08223b; font-family: Arial, sans-serif; margin: 14px; }
          h1 { font-size: 21px; margin: 0 0 3px; }
          .subtitle { color: #526670; font-size: 12px; font-weight: 700; margin: 0 0 10px; }
          .round { border: 1px solid #c7d9e4; border-radius: 7px; margin-bottom: 7px; padding: 7px; break-inside: avoid; }
          .round header { align-items: center; border-bottom: 1px solid #d9e8f0; display: grid; gap: 8px; grid-template-columns: 42px 92px 1fr; margin-bottom: 6px; padding-bottom: 5px; }
          .round header strong { font-size: 16px; }
          .round header span, .round header small { color: #526670; font-size: 11px; font-weight: 800; }
          .matches { display: grid; gap: 6px; grid-template-columns: repeat(var(--print-cols), minmax(0, 1fr)); }
          .match { background: #f4fbff; border-left: 4px solid #13a66f; border-radius: 7px; display: grid; gap: 4px; padding: 6px; }
          .match span { color: #0e5d8f; font-size: 10px; font-weight: 900; text-transform: uppercase; }
          .match b { color: #526670; font-size: 10px; text-transform: uppercase; }
          .pair { border: 1px solid rgba(8, 34, 59, 0.14); border-radius: 6px; font-size: 11px; font-weight: 800; line-height: 1.1; min-height: 30px; padding: 5px; }
          .score-line { align-items: stretch; display: grid; gap: 5px; grid-template-columns: minmax(0, 1fr) 34px; }
          .score-line i { background: #ffffff; border: 2px solid #08223b; border-radius: 6px; display: block; min-height: 30px; }
          body.compact h1 { font-size: 18px; }
          body.compact .subtitle { margin-bottom: 7px; }
          body.compact .round { margin-bottom: 5px; padding: 5px; }
          body.compact .round header { margin-bottom: 4px; padding-bottom: 4px; }
          body.compact .pair { font-size: 10px; min-height: 26px; padding: 4px; }
          body.compact .score-line { grid-template-columns: minmax(0, 1fr) 30px; }
          body.compact .score-line i { min-height: 26px; }
          body.dense h1 { font-size: 16px; }
          body.dense .subtitle { font-size: 10px; margin-bottom: 5px; }
          body.dense .round { margin-bottom: 4px; padding: 4px; }
          body.dense .round header { grid-template-columns: 34px 78px 1fr; gap: 5px; margin-bottom: 3px; padding-bottom: 3px; }
          body.dense .round header strong { font-size: 13px; }
          body.dense .round header span, body.dense .round header small { font-size: 9px; }
          body.dense .matches { gap: 4px; }
          body.dense .match { gap: 2px; padding: 4px; }
          body.dense .match span, body.dense .match b { font-size: 8px; }
          body.dense .pair { font-size: 9px; min-height: 22px; padding: 3px; }
          body.dense .score-line { gap: 3px; grid-template-columns: minmax(0, 1fr) 24px; }
          body.dense .score-line i { border-width: 1.5px; min-height: 22px; }
          @media print {
            body { margin: 0; }
          }
        </style>
      </head>
      <body class="${densityClass}">
        <h1>Programación ${htmlEscape(category)}</h1>
        <p class="subtitle">${htmlEscape(preview.timeWindow)} · ${categoryMatchCount} partidos</p>
        ${rows || "<p>No hay partidos para esta categoría.</p>"}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function organizationCategories(pairs, registrations = []) {
  return [...new Set([
    ...pairs.map((pair) => pair.category),
    ...registrations.map((registration) => registration.category),
  ].filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function pairPayments(payments, pairId) {
  return payments.filter((payment) => payment.pair_id === pairId);
}

function pairPaymentState(payments, pairId) {
  const related = pairPayments(payments, pairId);
  if (!related.length) return { label: "Sin pago", state: "warning" };
  if (related.every((payment) => payment.status === "pagado")) return { label: "Pago ok", state: "ok" };
  if (related.some((payment) => payment.status === "abonado")) return { label: "Pago abonado", state: "watch" };
  return { label: "Pago pendiente", state: "warning" };
}

function pairCheckInState(registrations, pairId) {
  const related = registrations.filter((registration) => registration.pair_id === pairId && registration.status !== "lista_espera" && registration.status !== "cancelada");
  if (!related.length) return { label: "Sin check-in", state: "warning", checked: 0, total: 0 };
  const checked = related.filter((registration) => registration.checked_in).length;
  if (checked === related.length) return { label: "Check-in ok", state: "ok", checked, total: related.length };
  if (checked > 0) return { label: `Check-in falta ${related.length - checked}`, state: "watch", checked, total: related.length };
  return { label: "Check-in pendiente", state: "warning", checked, total: related.length };
}

function organizationReadinessData({ pairs, payments, registrations, matches }) {
  const categories = organizationCategories(pairs, registrations);
  const completePairs = pairs.filter((pair) => pair.status === "completa" && pair.player_two_id);
  const incompletePairs = pairs.filter((pair) => pair.status === "buscando_partner" || !pair.player_two_id);
  const waitlistPairs = pairs.filter((pair) => pair.status === "lista_espera");
  const missingLevels = completePairs.filter((pair) => !pair.skill_level);
  const unpaidPairs = completePairs.filter((pair) => pairPaymentState(payments, pair.id).state !== "ok");
  const uncheckedPairs = completePairs.filter((pair) => pairCheckInState(registrations, pair.id).state !== "ok");
  const duplicatePlayers = [];
  const playerUsage = new Map();

  pairs.forEach((pair) => {
    [pair.player_one_id, pair.player_two_id].filter(Boolean).forEach((playerId) => {
      playerUsage.set(playerId, [...(playerUsage.get(playerId) || []), pair]);
    });
  });
  playerUsage.forEach((usedPairs) => {
    if (usedPairs.length > 1) duplicatePlayers.push(usedPairs);
  });

  const categoryStats = categories.map((category) => {
    const categoryPairs = pairs.filter((pair) => pair.category === category);
    const categoryComplete = categoryPairs.filter((pair) => pair.status === "completa" && pair.player_two_id);
    const categoryMatches = matches.filter((match) => {
      const one = pairs.find((pair) => pair.id === match.pair_one_id);
      const two = pairs.find((pair) => pair.id === match.pair_two_id);
      return one?.category === category || two?.category === category;
    });
    return {
      category,
      complete: categoryComplete.length,
      incomplete: categoryPairs.filter((pair) => pair.status === "buscando_partner" || !pair.player_two_id).length,
      waitlist: categoryPairs.filter((pair) => pair.status === "lista_espera").length,
      matches: categoryMatches.length,
      odd: categoryComplete.length % 2 !== 0,
    };
  });

  const alerts = [
    ...incompletePairs.map((pair) => ({ tone: "warning", text: `${pairName(pair)} sigue buscando partner.` })),
    ...unpaidPairs.map((pair) => ({ tone: "warning", text: `${pairName(pair)} tiene pago pendiente.` })),
    ...uncheckedPairs.map((pair) => ({ tone: "info", text: `${pairName(pair)} no tiene check-in completo.` })),
    ...missingLevels.map((pair) => ({ tone: "warning", text: `${pairName(pair)} no tiene nivel definido.` })),
    ...categoryStats.filter((item) => item.odd).map((item) => ({ tone: "warning", text: `${item.category} tiene número impar de parejas completas.` })),
    ...duplicatePlayers.map((usedPairs) => ({ tone: "danger", text: `Jugador duplicado en ${usedPairs.map((pair) => pairName(pair)).join(" y ")}.` })),
  ];

  return {
    alerts,
    categoryStats,
    ready: !incompletePairs.length && !unpaidPairs.length && !uncheckedPairs.length && !missingLevels.length && !duplicatePlayers.length,
    totals: {
      complete: completePairs.length,
      incomplete: incompletePairs.length,
      waitlist: waitlistPairs.length,
      unpaid: unpaidPairs.length,
      unchecked: uncheckedPairs.length,
    },
  };
}

function OrganizationReadiness({ pairs, payments, registrations, matches }) {
  const data = organizationReadinessData({ pairs, payments, registrations, matches });

  return (
    <section className="organization-readiness">
      <div className={`readiness-main ${data.ready ? "ok" : "watch"}`}>
        <div>
          <span>Preparación</span>
          <strong>{data.ready ? "Listo para programar" : "Pendientes antes de jugar"}</strong>
          <p>{data.totals.complete} completas · {data.totals.incomplete} incompletas · {data.totals.unpaid} pagos · {data.totals.unchecked} check-in</p>
        </div>
      </div>
      <div className="category-readiness-grid">
        {data.categoryStats.map((item) => (
          <article className={item.odd ? "warning" : "ok"} key={item.category}>
            <strong>{item.category}</strong>
            <span>{item.complete} parejas completas</span>
            <small>{item.incomplete} buscando · {item.waitlist} espera · {item.matches} partidos</small>
          </article>
        ))}
      </div>
      <div className="organization-alerts">
        {data.alerts.length ? data.alerts.slice(0, 8).map((alert) => (
          <p className={alert.tone} key={alert.text}>{alert.text}</p>
        )) : (
          <p className="ok">Sin alertas de organización.</p>
        )}
        {data.alerts.length > 8 && <p className="info">{data.alerts.length - 8} alertas más.</p>}
      </div>
    </section>
  );
}

function CheckInBlock({ registrations, selectedEventId, onUpdateRegistration }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const normalizedQuery = query.trim().toLowerCase();
  const categories = organizationCategories([], registrations);
  const activeRegistrations = registrations.filter((registration) => registration.status !== "lista_espera" && registration.status !== "cancelada");
  const visibleRegistrations = activeRegistrations.filter((registration) => (
    (categoryFilter === "all" || registration.category === categoryFilter)
    && (statusFilter === "all" || (statusFilter === "checked" ? registration.checked_in : !registration.checked_in))
    && (!normalizedQuery || (
      registration.player.name.toLowerCase().includes(normalizedQuery)
      || pairName(registration.pair).toLowerCase().includes(normalizedQuery)
      || registration.category.toLowerCase().includes(normalizedQuery)
    ))
  ));
  const presentCount = activeRegistrations.filter((registration) => registration.checked_in).length;

  if (!selectedEventId) return null;

  return (
    <details className="checkin-block" open>
      <summary>Check-in de jugadores</summary>
      <div className="checkin-toolbar">
        <input
          type="search"
          placeholder="Buscar jugador, pareja o categoría"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">Todas las categorías</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="pending">Pendientes</option>
          <option value="checked">Presentes</option>
          <option value="all">Todos</option>
        </select>
        <button
          type="button"
          className="secondary-action"
          disabled={!visibleRegistrations.length}
          onClick={async () => {
            for (const registration of visibleRegistrations) {
              if (!registration.checked_in) await onUpdateRegistration(registration.id, { checked_in: true });
            }
          }}
        >
          Marcar visibles
        </button>
        <span>{presentCount}/{activeRegistrations.length} presentes</span>
      </div>
      <div className="checkin-list">
        {visibleRegistrations.length ? visibleRegistrations.map((registration) => (
          <label className={`checkin-row ${registration.checked_in ? "checked" : ""}`} key={registration.id}>
            <input
              type="checkbox"
              checked={registration.checked_in}
              onChange={(event) => onUpdateRegistration(registration.id, { checked_in: event.target.checked })}
            />
            <span>
              <strong>{registration.player.name}</strong>
              <small>{pairName(registration.pair)} · {registration.category} · {registration.role}</small>
            </span>
            <em>{registration.status}</em>
          </label>
        )) : (
          <p className="empty">No hay inscripciones para check-in.</p>
        )}
      </div>
    </details>
  );
}

function PartnerMatchingBlock({ pairs, participantOptions, eventId, onChange }) {
  const openPairs = pairs.filter((pair) => pair.status === "buscando_partner" || !pair.player_two_id);
  const completePairs = pairs.filter((pair) => pair.status === "completa" && pair.player_two_id);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const categories = organizationCategories(pairs);
  const visibleOpenPairs = openPairs.filter((pair) => categoryFilter === "all" || pair.category === categoryFilter);

  if (!openPairs.length) return null;

  function candidateScore(openPair, option) {
    const existingPair = pairs.find((pair) => `player:${pair.player_one_id}` === option.value || `player:${pair.player_two_id}` === option.value);
    const sameCategory = existingPair?.category === openPair.category || option.category === openPair.category;
    const levelDiff = existingPair?.skill_level ? Math.abs(Number(existingPair.skill_level || 5) - Number(openPair.skill_level || 5)) : 1;
    return (sameCategory ? 0 : 10) + levelDiff;
  }

  return (
    <article className="data-block partner-matching">
      <div className="block-head">
        <h3><Users size={16} /> Match de partners</h3>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">Todas</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </div>
      <div className="partner-match-list">
        {visibleOpenPairs.map((pair) => {
          const options = participantOptions
            .filter((option) => option.value !== `player:${pair.player_one_id}`)
            .filter((option) => !completePairs.some((completePair) => (
              `player:${completePair.player_one_id}` === option.value
              || `player:${completePair.player_two_id}` === option.value
            )))
            .sort((left, right) => candidateScore(pair, left) - candidateScore(pair, right))
            .slice(0, 5);

          return (
            <section className="partner-match-row" key={pair.id}>
              <div>
                <strong>{pairName(pair)}</strong>
                <span>{pair.category} · {pairLevelLabel(pair.skill_level)}</span>
              </div>
              <div className="partner-candidates">
                {options.length ? options.map((option) => (
                  <button
                    type="button"
                    className="secondary-action"
                    key={`${pair.id}-${option.value}`}
                    onClick={() => onChange(async () => {
                      const playerTwoId = await resolveParticipantPlayerId(option.value, participantOptions, pair.category);
                      const sourceOpenPair = openPairs.find((openPair) => (
                        openPair.id !== pair.id
                        && (`player:${openPair.player_one_id}` === option.value || `player:${openPair.player_two_id}` === option.value)
                      ));
                      await api.updatePair(eventId, pair.id, {
                        player_two_id: playerTwoId,
                        status: "completa",
                      });
                      if (sourceOpenPair) await api.deletePair(eventId, sourceOpenPair.id);
                    })}
                  >
                    {option.name}
                  </button>
                )) : (
                  <span className="muted">Sin candidatos disponibles.</span>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
}

function scheduledMatchRows(matches, pairs) {
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
  return matches
    .map((match) => {
      const schedule = parseFixtureRound(match.round_name);
      const pairOne = pairById.get(match.pair_one_id);
      const pairTwo = pairById.get(match.pair_two_id);
      const category = fixtureCategoryFromPairs(pairOne, pairTwo, schedule.category);
      return {
        category,
        court: match.court || "",
        courtLabel: normalizeCourt(match.court),
        done: hasResult(match),
        group: schedule.group,
        match,
        pairOne: pairOne ? pairName(pairOne) : `Pareja ${match.pair_one_id}`,
        pairTwo: pairTwo ? pairName(pairTwo) : `Pareja ${match.pair_two_id}`,
        time: schedule.time,
        turn: schedule.turn,
      };
    })
    .sort((a, b) => {
      const timeCompare = minutesFromSlot(a.time || a.turn) - minutesFromSlot(b.time || b.turn);
      if (timeCompare !== 0) return timeCompare;
      return String(a.court || "zz").localeCompare(String(b.court || "zz"), undefined, { numeric: true });
    });
}

function buildOperatorNotices({ pairs, matches, payments, registrations, resultSubmissions, nextSlot }) {
  const notices = [];
  const conflictCount = resultSubmissions.filter((submission) => submission.status === "conflicto").length;
  const missingCheckIn = registrations.filter((registration) => !registration.checked_in && registration.status !== "lista_espera" && registration.status !== "cancelada").length;
  const pendingPayments = payments.filter((payment) => payment.status !== "pagado").length;
  const incompletePairs = pairs.filter((pair) => pair.status === "buscando_partner" || !pair.player_two_id).length;
  const pendingResults = matches.filter((match) => !matchHasResult(match)).length;
  if (conflictCount) {
    notices.push({ severity: "danger", title: "Resultados en conflicto", message: `${conflictCount} reporte${conflictCount === 1 ? "" : "s"} necesita revisión de mesa.` });
  }
  if (missingCheckIn) {
    notices.push({ severity: "warning", title: "Check-in pendiente", message: `${missingCheckIn} jugador${missingCheckIn === 1 ? "" : "es"} aún no están marcados presentes.` });
  }
  if (incompletePairs) {
    notices.push({ severity: "warning", title: "Parejas incompletas", message: `${incompletePairs} dupla${incompletePairs === 1 ? "" : "s"} siguen buscando partner.` });
  }
  if (pendingPayments) {
    notices.push({ severity: "info", title: "Pagos pendientes", message: `${pendingPayments} pago${pendingPayments === 1 ? "" : "s"} por regularizar.` });
  }
  if (nextSlot) {
    notices.push({ severity: "success", title: "Siguiente turno listo", message: `Próximo bloque: ${nextSlot}.` });
  } else if (!pendingResults && matches.length) {
    notices.push({ severity: "success", title: "Evento listo para cierre", message: "Todos los partidos tienen resultado cargado." });
  }
  return notices.slice(0, 5);
}

function OperatorControlTower({ pairs, matches, payments, registrations, resultSubmissions = [] }) {
  const rows = scheduledMatchRows(matches, pairs);
  const pendingRows = rows.filter((row) => !row.done);
  const nextSlot = pendingRows[0]?.time || pendingRows[0]?.turn || "";
  const nextRows = nextSlot ? rows.filter((row) => (row.time || row.turn) === nextSlot) : [];
  const courtNames = [...new Set(rows.map((row) => row.court).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  const completedCount = rows.filter((row) => row.done).length;
  const checkedInCount = registrations.filter((registration) => registration.checked_in).length;
  const pendingPayments = payments.filter((payment) => payment.status !== "pagado").length;
  const collisionCount = rows.filter((row, index) => rows.some((other, otherIndex) => (
    otherIndex !== index
    && other.court === row.court
    && (other.time || other.turn) === (row.time || row.turn)
  ))).length;
  const rowsByCourt = courtNames.reduce((groups, court) => {
    groups[court] = rows.filter((row) => row.court === court).slice(0, 5);
    return groups;
  }, {});
  const operatorNotices = buildOperatorNotices({ pairs, matches, payments, registrations, resultSubmissions, nextSlot });

  return (
    <section className="operator-tower">
      <div className="operator-tower-head">
        <div>
          <p className="eyebrow">Operador Pro</p>
          <h3>Torre de control</h3>
        </div>
        <div className="operator-live-kpis">
          <span>{completedCount}/{rows.length} resultados</span>
          <span>{checkedInCount}/{registrations.length} presentes</span>
          <span>{pendingPayments} pagos pendientes</span>
          <span className={collisionCount ? "danger" : ""}>{collisionCount ? `${collisionCount} choques` : "Sin choques"}</span>
        </div>
      </div>

      <NoticeCenter title="Avisos de mesa" notices={operatorNotices} emptyText="Sin avisos operativos." />

      <div className="operator-next-strip">
        <div>
          <span>Próximo turno</span>
          <strong>{nextSlot || "Sin pendientes"}</strong>
          <small>{nextRows.length} partido{nextRows.length === 1 ? "" : "s"} programado{nextRows.length === 1 ? "" : "s"}</small>
        </div>
        <div className="operator-next-list">
          {nextRows.length ? nextRows.map((row) => (
            <p key={`tower-next-${row.match.id}`}>
              <b>{row.courtLabel}</b> {row.pairOne} vs {row.pairTwo}
            </p>
          )) : (
            <p>La programación aparecerá cuando generes partidos.</p>
          )}
        </div>
      </div>

      {courtNames.length > 0 && (
        <div className="operator-courts">
          {courtNames.map((court) => (
            <article key={`tower-court-${court}`}>
              <strong>{normalizeCourt(court)}</strong>
              {rowsByCourt[court].map((row) => (
                <div className={row.done ? "done" : nextSlot && (row.time || row.turn) === nextSlot ? "next" : ""} key={`tower-${court}-${row.match.id}`}>
                  <span>{row.time || row.turn}</span>
                  <small>{row.category}</small>
                  <p>{row.pairOne} vs {row.pairTwo}</p>
                </div>
              ))}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function EventWhatsappBlock({ whatsapp, draftEvent }) {
  const [copied, setCopied] = useState(false);
  const draftMessage = useMemo(() => {
    const price = Number(draftEvent.price || 0);
    const capacity = Math.max(0, Number(draftEvent.capacity || 0));
    const registrationSlots = Array.from({ length: capacity }, (_, index) => `${index + 1}.`);
    return [
      draftEvent.name ? `*${draftEvent.name}*` : "*Nuevo evento AMAR*",
      draftEvent.date ? `Fecha: ${draftEvent.date}` : "",
      draftEvent.schedule ? `Horario: ${draftEvent.schedule}` : "",
      draftEvent.place ? `Lugar: ${draftEvent.place}` : "",
      draftEvent.categories ? `Categorías: ${draftEvent.categories}` : "",
      price ? `Valor: $${price.toLocaleString("es-CL")}` : "",
      draftEvent.capacity ? `Cupos: ${draftEvent.capacity}` : "",
      "",
      "Inscripciones abiertas.",
      "",
      "*Lista de inscritos*",
      ...registrationSlots,
    ].join("\n");
  }, [draftEvent]);
  const message = draftMessage || whatsapp?.trim() || "";

  async function copyMessage() {
    if (!message) return;
    await navigator.clipboard.writeText(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="data-block event-whatsapp-card">
      <div className="block-head">
        <div>
          <h3><Clipboard size={16} /> Mensaje WhatsApp</h3>
          <p className="muted">Plantilla lista para copiar cuando el evento quede creado.</p>
        </div>
        <button type="button" className="secondary-action" onClick={copyMessage} disabled={!message}>
          <Clipboard size={16} /> {copied ? "Copiado" : "Copiar mensaje"}
        </button>
      </div>
      <textarea className="whatsapp" value={message} readOnly />
    </div>
  );
}

function parseScheduleRange(value) {
  const [start = "", end = ""] = (value || "").match(/\d{1,2}:\d{2}/g) || [];
  return {
    start: /^\d{1,2}:\d{2}$/.test(start) ? minutesToTime(timeToMinutes(start)) : "",
    end: /^\d{1,2}:\d{2}$/.test(end) ? minutesToTime(timeToMinutes(end)) : "",
  };
}

function formatScheduleRange(start, end) {
  if (start && end) return `${start} - ${end}`;
  return start || end || "";
}

function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || "");
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTime(totalMinutes) {
  const minutesInDay = 24 * 60;
  const normalized = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function deriveFixtureTiming(schedule, warmupMinutes = 0) {
  const { start, end } = parseScheduleRange(schedule);
  const startMinutes = timeToMinutes(start);
  let endMinutes = timeToMinutes(end);
  const warmup = Math.max(0, Number(warmupMinutes || 0));
  if (startMinutes === null || endMinutes === null) {
    return { valid: false, eventStart: start, eventEnd: end, fixtureStart: "", rentalMinutes: 0, warmupMinutes: warmup };
  }
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  const fixtureStartMinutes = startMinutes + warmup;
  return {
    valid: true,
    eventStart: start,
    eventEnd: end,
    fixtureStart: minutesToTime(fixtureStartMinutes),
    rentalMinutes: Math.max(0, endMinutes - fixtureStartMinutes),
    warmupMinutes: warmup,
  };
}

function EventScheduleInputs({ value, onChange }) {
  const { start, end } = parseScheduleRange(value);

  function update(part, nextValue) {
    const nextStart = part === "start" ? nextValue : start;
    const nextEnd = part === "end" ? nextValue : end;
    onChange(formatScheduleRange(nextStart, nextEnd));
  }

  return (
    <div className="form-field schedule-field">
      <span>Horario</span>
      <div>
        <input
          aria-label="Hora de inicio"
          type="time"
          value={start}
          onChange={(event) => update("start", event.target.value)}
          required
        />
        <input
          aria-label="Hora de término"
          type="time"
          value={end}
          onChange={(event) => update("end", event.target.value)}
          required
        />
      </div>
      <small>Bloque horario del evento.</small>
    </div>
  );
}

function EventCategorySelect({ value, onChange }) {
  const normalizedValue = allPadelCategories.includes(value) ? value : "";

  return (
    <select value={normalizedValue} onChange={(event) => onChange(event.target.value)}>
      <option value="">Categoría</option>
      {eventCategoryGroups.map((group) => (
        <optgroup key={group.key} label={group.label}>
          {group.categories.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function EventForm({ form, setForm, onSubmit, isEditing }) {
  return (
    <div className="data-block">
      <h3><CalendarPlus size={16} /> {isEditing ? "Editar evento" : "Crear evento"}</h3>
      <form onSubmit={onSubmit} className="event-form-grid">
        <label className="form-field">
          <span>Nombre del evento</span>
          <input placeholder="Americano AMAR..." value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <small>Nombre visible en la app y mensajes.</small>
        </label>
        <label className="form-field">
          <span>Fecha</span>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <small>Día en que se juega.</small>
        </label>
        <label className="form-field">
          <span>Lugar</span>
          <input placeholder="Club o sede" value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} required />
          <small>Cancha, club o dirección corta.</small>
        </label>
        <label className="form-field">
          <span>Precio</span>
          <input type="number" placeholder="13000" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          <small>Valor por jugador o inscripción, según tu criterio.</small>
        </label>
        <EventScheduleInputs value={form.schedule} onChange={(schedule) => setForm({ ...form, schedule })} />
        <label className="form-field">
          <span>Cupos</span>
          <input type="number" placeholder="56" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          <small>Total máximo de jugadores/inscritos.</small>
        </label>
        <label className="form-field">
          <span>Categorías</span>
          <input placeholder="5taD+ / 4taC+" value={form.categories} onChange={(e) => setForm({ ...form, categories: e.target.value })} required />
          <small>Categorías disponibles para inscripción.</small>
        </label>
        <label className="form-field">
          <span>Estado operativo</span>
          <select value={form.status || "registration_open"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {eventStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <small>Controla si el evento está en borrador, abierto, en juego o finalizado.</small>
        </label>
        <label className="event-active-toggle">
          <input
            type="checkbox"
            checked={form.is_active !== false}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          <span>
            <strong>Evento activo</strong>
            <small>Aparece en Registro, Resultados y selectores. Los eventos nuevos quedan activos por defecto.</small>
          </span>
        </label>
        <label className="form-field wide-field">
          <span>Descripción</span>
          <textarea placeholder="Notas internas, origen de datos o instrucciones del evento" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <small>Texto libre para recordar detalles del evento.</small>
        </label>
        <button><CalendarPlus size={16} /> {isEditing ? "Actualizar evento" : "Guardar evento"}</button>
      </form>
    </div>
  );
}

function AccessDenied({ moduleName }) {
  return (
    <section className="users-page">
      <div className="public-hero users-hero">
        <p className="eyebrow">Permisos</p>
        <h2>Sin acceso a {moduleName}</h2>
        <p>Tu perfil no tiene este módulo habilitado. Un superadmin puede activarlo desde Perfiles.</p>
      </div>
    </section>
  );
}

function ProfilePermissionsPage({ modules, rolePermissions, onSave, loading }) {
  const roleLabels = {
    jugador: "Jugador",
    operador: "Operador resultados",
    admin: "Administrador",
    superadmin: "Superadmin",
  };
  const roleDescriptions = {
    jugador: "Persona que se inscribe, consulta resultados y en el futuro verá estadísticas propias.",
    operador: "Persona de cancha o mesa que carga resultados durante el evento.",
    admin: "Equipo de operación que administra eventos, jugadores, pagos y parejas.",
    superadmin: "Cuenta dueña del sistema. Siempre conserva todos los permisos.",
  };

  return (
    <section className="profiles-page">
      <div className="public-hero users-hero">
        <p className="eyebrow">Perfiles</p>
        <h2>Permisos por rol</h2>
        <p>Define qué módulos aparecen y qué acciones puede ejecutar cada tipo de cuenta.</p>
      </div>

      <div className="profile-matrix">
        {rolePermissions.map((roleConfig) => (
          <ProfilePermissionCard
            key={roleConfig.role}
            config={roleConfig}
            modules={modules}
            roleLabel={roleLabels[roleConfig.role] || roleConfig.role}
            description={roleDescriptions[roleConfig.role]}
            onSave={onSave}
            loading={loading}
          />
        ))}
      </div>
    </section>
  );
}

function ProfilePermissionCard({ config, modules, roleLabel, description, onSave, loading }) {
  const [draft, setDraft] = useState(config.permissions);
  const isSuperadmin = config.role === "superadmin";

  useEffect(() => {
    setDraft(config.permissions);
  }, [config.role, config.permissions]);

  function toggle(moduleKey) {
    if (isSuperadmin) return;
    setDraft((current) => ({ ...current, [moduleKey]: !current[moduleKey] }));
  }

  return (
    <article className="profile-card">
      <div className="block-head">
        <div>
          <h3><Users size={16} /> {roleLabel}</h3>
          <p>{description}</p>
        </div>
        <button type="button" onClick={() => onSave(config.role, draft)} disabled={loading || isSuperadmin}>
          Guardar
        </button>
      </div>
      <div className="permission-list">
        {modules.map((module) => (
          <label className="permission-toggle" key={module.key}>
            <input
              type="checkbox"
              checked={Boolean(draft[module.key])}
              disabled={isSuperadmin}
              onChange={() => toggle(module.key)}
            />
            <span>
              <strong>{module.label}</strong>
              <small>{module.description}</small>
            </span>
          </label>
        ))}
      </div>
    </article>
  );
}

function UsersPage({ authUser, users, form, setForm, onSubmit, onUpdateUser, onResetPassword, onDeleteUser }) {
  const canManageUsers = Boolean(authUser);

  if (!canManageUsers) {
    return (
      <section className="users-page">
        <div className="public-hero users-hero">
          <p className="eyebrow">Usuarios</p>
          <h2>Sin permisos de administración</h2>
          <p>Esta sección queda reservada para administradores y superadministradores.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="users-page">
      <div className="public-hero users-hero">
        <p className="eyebrow">Directorio AmarPadel</p>
        <h2>Usuarios y permisos</h2>
        <p>Administra perfiles de jugadores, operadores de resultados y cuentas administrativas.</p>
      </div>
      <UsersBlock
        authUser={authUser}
        users={users}
        form={form}
        setForm={setForm}
        onSubmit={onSubmit}
        onUpdateUser={onUpdateUser}
        onResetPassword={onResetPassword}
        onDeleteUser={onDeleteUser}
      />
    </section>
  );
}

function UsersBlock({ authUser, users, form, setForm, onSubmit, onUpdateUser, onResetPassword, onDeleteUser }) {
  const [query, setQuery] = useState("");
  const [resetResult, setResetResult] = useState(null);
  const roleLabels = {
    jugador: "Jugador",
    operador: "Operador resultados",
    admin: "Administrador",
    superadmin: "Superadmin",
  };
  const normalizedQuery = query.trim().toLowerCase();
  const visibleUsers = normalizedQuery
    ? users.filter((user) => (
      user.name.toLowerCase().includes(normalizedQuery)
      || user.email.toLowerCase().includes(normalizedQuery)
      || user.role.toLowerCase().includes(normalizedQuery)
      || (user.category || "").toLowerCase().includes(normalizedQuery)
    ))
    : users;

  return (
    <div className="data-block users-block">
      {resetResult && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setResetResult(null)}>
          <div className="registration-modal password-reset-modal" role="dialog" aria-modal="true" aria-labelledby="password-reset-title" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setResetResult(null)} aria-label="Cerrar restauración">
              <X size={18} />
            </button>
            <div className="modal-icon">
              <UserPlus size={24} />
            </div>
            <div>
              <p className="eyebrow">Clave temporal</p>
              <h2 id="password-reset-title">Clave restaurada para {resetResult.user.name}</h2>
              <p>Entrégala por un canal directo y pídele que la cambie desde su perfil cuando tengamos esa opción disponible.</p>
              <div className="temporary-password-box">
                <span>{resetResult.user.email}</span>
                <strong>{resetResult.temporary_password}</strong>
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(resetResult.temporary_password)}
              >
                Copiar clave
              </button>
              <button type="button" className="secondary-action" onClick={() => setResetResult(null)}>Listo</button>
            </div>
          </div>
        </div>
      )}
      <div className="block-head">
        <h3><Users size={16} /> Usuarios y permisos</h3>
        <span>{users.length} cuenta{users.length === 1 ? "" : "s"}</span>
      </div>
      <div className="users-toolbar">
        <input
          type="search"
          placeholder="Buscar por nombre, email, rol o categoría"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span>{visibleUsers.length} visibles</span>
      </div>
      <form onSubmit={onSubmit} className="user-form-grid">
        <label className="form-field">
          <span>Nombre</span>
          <input placeholder="Nombre y apellido" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </label>
        <label className="form-field">
          <span>Email</span>
          <input type="email" placeholder="correo@dominio.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        </label>
        <label className="form-field">
          <span>Contraseña</span>
          <input type="password" placeholder="Clave inicial" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
        </label>
        <label className="form-field">
          <span>Rol</span>
          <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            {Object.entries(roleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
          </select>
        </label>
        <button>Crear usuario</button>
      </form>
      <div className="users-list">
        {visibleUsers.length ? visibleUsers.map((user) => (
          <UserAdminRow
            key={user.id}
            user={user}
            authUser={authUser}
            roleLabels={roleLabels}
            onUpdateUser={onUpdateUser}
            onResetPassword={async (targetUser) => {
              const result = await onResetPassword(targetUser.id);
              if (result) setResetResult(result);
            }}
            onDeleteUser={onDeleteUser}
          />
        )) : (
          <p className="empty">No hay usuarios con ese filtro.</p>
        )}
      </div>
    </div>
  );
}

function UserAdminRow({ user, authUser, roleLabels, onUpdateUser, onResetPassword, onDeleteUser }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    category: user.category || "5ta",
    preferred_side: user.preferred_side || "indiferente",
    role: user.role,
    password: "",
  });
  const isSelf = authUser?.id === user.id;

  useEffect(() => {
    setDraft({
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      category: user.category || "5ta",
      preferred_side: user.preferred_side || "indiferente",
      role: user.role,
      password: "",
    });
  }, [user.id, user.name, user.email, user.phone, user.category, user.preferred_side, user.role]);

  async function save() {
    const payload = {
      name: draft.name,
      email: draft.email,
      phone: draft.phone || null,
      category: draft.category || null,
      preferred_side: draft.preferred_side,
      role: draft.role,
    };
    if (draft.password.trim()) payload.password = draft.password;
    await onUpdateUser(user.id, payload);
    setEditing(false);
  }

  async function resetPassword() {
    const confirmed = window.confirm(`Se generará una clave temporal para ${user.name}. La clave actual dejará de funcionar.`);
    if (!confirmed) return;
    await onResetPassword(user);
  }

  if (editing) {
    return (
      <div className="user-edit-row">
        <label className="form-field compact">
          <span>Nombre</span>
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
        </label>
        <label className="form-field compact">
          <span>Email</span>
          <input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} required />
        </label>
        <label className="form-field compact">
          <span>Teléfono</span>
          <input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="Opcional" />
        </label>
        <label className="form-field compact">
          <span>Categoría</span>
          <CategorySelect value={draft.category} onChange={(category) => setDraft({ ...draft, category })} />
        </label>
        <label className="form-field compact">
          <span>Lado</span>
          <select value={draft.preferred_side} onChange={(event) => setDraft({ ...draft, preferred_side: event.target.value })}>
            <option value="drive">Drive</option>
            <option value="reves">Revés</option>
            <option value="indiferente">Indiferente</option>
          </select>
        </label>
        <label className="form-field compact">
          <span>Rol</span>
          <select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })}>
            {Object.entries(roleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
          </select>
        </label>
        <label className="form-field compact">
          <span>Nueva clave</span>
          <input type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} placeholder="Dejar igual" />
        </label>
        <div className="user-row-actions">
          <button type="button" onClick={save}>Guardar</button>
          <button type="button" className="secondary-action" onClick={() => setEditing(false)}>Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="user-row">
      <div>
        <strong>{user.name}</strong>
        <small>{user.category || "Sin categoría"} · {user.preferred_side || "lado indiferente"}{user.phone ? ` · ${user.phone}` : ""}</small>
      </div>
      <span>{user.email}</span>
      <em>{roleLabels[user.role] || user.role}</em>
      <div className="user-row-actions">
        <button type="button" className="secondary-action" onClick={() => setEditing(true)}>Editar</button>
        <button type="button" className="secondary-action" onClick={resetPassword}>Restaurar clave</button>
        <button type="button" className="danger-action" onClick={() => onDeleteUser(user)} disabled={isSelf}>Eliminar</button>
      </div>
    </div>
  );
}

function PublicRegistration({ events, selectedEventId, setSelectedEventId, selectedEvent, authUser, members, form, setForm, success, setSuccess, notice, setNotice, onSubmit, loading, pairs, goSignup, goLogin }) {
  const [partnerMode, setPartnerMode] = useState("searching");
  const eventCategories = [
    ...new Set([
      ...(selectedEvent?.category_configs || []).map((config) => config.category).filter(Boolean),
      ...(selectedEvent?.categories || "").split("/").map((category) => category.trim()).filter(Boolean),
    ]),
  ];
  const options = eventCategories.length ? eventCategories : categoryOptions[form.gender];
  const hasPartner = partnerMode === "complete";
  const selectedCategory = form.category || options[0] || "";
  const availableMembers = members.filter((member) => member.id !== authUser?.id);
  const selectedPartnerMember = availableMembers.find((member) => String(member.id) === String(form.partner_member_id));
  const selectedEventPairs = pairs.filter((pair) => String(pair.event_id) === String(selectedEventId));
  const activeSelectedPairs = selectedEventPairs.filter((pair) => pair.status !== "lista_espera");
  const availableSpots = selectedEvent ? Math.max((selectedEvent.capacity || 0) - activeSelectedPairs.length, 0) : 0;
  const needsPlayerAccount = authUser?.role !== "jugador";
  const isWaitlist = Boolean(selectedEvent && availableSpots <= 0);
  const canSubmitRegistration = Boolean(selectedEventId && form.name.trim() && form.email.trim() && (!hasPartner || form.partner_member_id));
  const formPaymentCount = Number(Boolean(form.paid)) + Number(Boolean(hasPartner && form.partner_paid));
  const registrationStep = needsPlayerAccount ? 1 : selectedEventId ? 3 : 2;

  useEffect(() => {
    if (!notice) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setNotice(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [notice, setNotice]);

  function applyPartnerMember(memberId) {
    const member = availableMembers.find((item) => String(item.id) === String(memberId));
    setForm({
      ...form,
      partner_member_id: memberId,
      partner_name: member?.name || "",
      partner_email: "",
      partner_phone: member?.phone || "",
      partner_preferred_side: member?.preferred_side || "indiferente",
    });
  }

  function selectEvent(eventId) {
    setSelectedEventId(String(eventId));
    setForm({ ...form, category: "" });
    setSuccess(null);
  }

  function choosePartnerMode(mode) {
    setPartnerMode(mode);
    if (mode === "searching") {
      setForm({
        ...form,
        partner_member_id: "",
        partner_name: "",
        partner_email: "",
        partner_phone: "",
        partner_paid: false,
      });
    }
  }

  return (
    <section className="public-page">
      {notice && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setNotice(null)}>
          <div className="registration-modal" role="dialog" aria-modal="true" aria-labelledby="registration-notice-title" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setNotice(null)} aria-label="Cerrar aviso">
              <X size={18} />
            </button>
            <div className="modal-icon">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="eyebrow">Registro</p>
              <h2 id="registration-notice-title">{notice.title}</h2>
              <p>{notice.message}</p>
              <small>Revisa la lista de inscritos de {notice.eventName} antes de intentar nuevamente.</small>
            </div>
            <button type="button" onClick={() => setNotice(null)}>Entendido</button>
          </div>
        </div>
      )}
      <div className="registration-wizard">
        <section className="registration-hero-card">
          <div>
            <p className="eyebrow">Inscripción jugador</p>
            <h2>Anótate al evento en menos de un minuto</h2>
            <p>Elige el torneo, confirma tu categoría y decide si vienes con partner o quieres que la organización te complete.</p>
          </div>
          <div className="registration-hero-side">
            {authUser?.role === "jugador" ? (
              <div className="registration-player-chip">
                <span>Entrando como</span>
                <strong>{authUser.name}</strong>
                <small>{authUser.category || "Sin categoría"} · {authUser.preferred_side || "lado indiferente"}</small>
              </div>
            ) : (
              <div className="registration-player-chip">
                <span>Primer paso</span>
                <strong>Crea o entra a tu perfil</strong>
                <small>Así el evento puede recordar tus partidos, ranking y avisos.</small>
              </div>
            )}
            <div className="registration-progress" aria-label="Pasos de inscripción">
              <span className={registrationStep >= 1 ? "active" : ""}><UserPlus size={16} /> Cuenta</span>
              <span className={registrationStep >= 2 ? "active" : ""}><CalendarPlus size={16} /> Evento</span>
              <span className={registrationStep >= 3 ? "active" : ""}><Check size={16} /> Confirmar</span>
            </div>
          </div>
        </section>

        {needsPlayerAccount ? (
          <section className="registration-account-gate">
            <div className="modal-icon">
              <UserPlus size={24} />
            </div>
            <div>
              <p className="eyebrow">Cuenta jugador requerida</p>
              <h2>Necesitamos saber quién eres antes de inscribirte</h2>
              <p>Tu perfil evita duplicados, te muestra el avance del evento y deja tus resultados asociados a tu cuenta.</p>
            </div>
            <div className="registration-gate-benefits" aria-label="Beneficios del perfil jugador">
              <span><Check size={16} /> Inscripción más rápida en próximos eventos</span>
              <span><Check size={16} /> Ranking y partidos visibles desde tu perfil</span>
              <span><Check size={16} /> Dispositivo recordado si lo autorizas al entrar</span>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={goSignup}>Crear perfil jugador</button>
              <button type="button" className="secondary-action" onClick={goLogin}>Ya tengo cuenta</button>
            </div>
          </section>
        ) : (
          <form onSubmit={onSubmit} className="registration-wizard-grid">
            <main className="registration-flow">
              {success && (
                <div className={`registration-success ${success.waitlisted ? "waitlisted" : ""}`}>
                  <strong>{success.waitlisted ? "Quedaste en lista de espera" : "Inscripción registrada"}</strong>
                  <span>
                    {success.playerName}
                    {success.partnerName ? ` y ${success.partnerName}` : ""} {success.waitlisted ? "quedaron en lista de espera para" : "quedaron inscritos en"} {success.eventName}.
                  </span>
                  <button type="button" className="secondary-action" onClick={() => setSuccess(null)}>Hacer otra inscripción</button>
                </div>
              )}

              <section className="registration-step-card">
                <div className="step-card-head">
                  <span>1</span>
                  <div>
                    <h3>Escoge el evento</h3>
                    <p>La disponibilidad se calcula con las parejas inscritas activas.</p>
                  </div>
                </div>
                <div className="registration-event-grid">
                  {events.map((event) => {
                    const isSelected = String(event.id) === String(selectedEventId);
                    const eventPairs = pairs.filter((pair) => String(pair.event_id) === String(event.id) && pair.status !== "lista_espera");
                    const eventSpots = Math.max((event.capacity || 0) - eventPairs.length, 0);
                    return (
                      <button
                        type="button"
                        className={`event-choice-card ${isSelected ? "active" : ""}`}
                        key={event.id}
                        onClick={() => selectEvent(event.id)}
                      >
                        <span className={eventSpots > 0 ? "spot-pill" : "spot-pill waitlist"}>{eventSpots > 0 ? `${eventSpots} cupos` : "Lista de espera"}</span>
                        <strong>{event.name}</strong>
                        <small>{event.date} · {event.schedule}</small>
                        <em>{event.place}</em>
                        <b>{event.categories}</b>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className={`registration-step-card ${!selectedEventId ? "disabled" : ""}`}>
                <div className="step-card-head">
                  <span>2</span>
                  <div>
                    <h3>Define cómo jugarás</h3>
                    <p>Aquí solo eliges categoría y partner; la organización completa los ajustes internos después.</p>
                  </div>
                </div>
                <div className="registration-detail-grid">
                  <label className="form-field">
                    <span>Categoría del evento</span>
                    <select value={selectedCategory} onChange={(e) => setForm({ ...form, category: e.target.value })} disabled={!selectedEventId}>
                      {options.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Lado preferido</span>
                    <select value={form.preferred_side} onChange={(e) => setForm({ ...form, preferred_side: e.target.value })}>
                      <option value="drive">Drive</option>
                      <option value="reves">Revés</option>
                      <option value="indiferente">Indiferente</option>
                    </select>
                  </label>
                  <label className="form-field wide-field">
                    <span>Teléfono</span>
                    <input placeholder="Opcional" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </label>
                </div>

                <div className="partner-mode-cards">
                  <button type="button" className={!hasPartner ? "active" : ""} onClick={() => choosePartnerMode("searching")}>
                    <Users size={18} />
                    <strong>Busco partner</strong>
                    <small>Te anotamos y la organización podrá completarte.</small>
                  </button>
                  <button type="button" className={hasPartner ? "active" : ""} onClick={() => choosePartnerMode("complete")}>
                    <Check size={18} />
                    <strong>Vengo con partner</strong>
                    <small>Selecciona una cuenta jugador registrada.</small>
                  </button>
                </div>

                {hasPartner && (
                  <div className="partner-picker-card">
                    <label className="form-field wide-field">
                      <span>Partner</span>
                      <select value={form.partner_member_id} onChange={(e) => applyPartnerMember(e.target.value)} required={hasPartner}>
                        <option value="">Buscar en miembros registrados</option>
                        {availableMembers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}{member.category ? ` · ${member.category}` : ""}{member.preferred_side ? ` · ${member.preferred_side}` : ""}
                          </option>
                        ))}
                      </select>
                      <small>Si no aparece, primero debe crear su perfil jugador.</small>
                    </label>
                    {selectedPartnerMember && (
                      <div className="member-preview">
                        <strong>{selectedPartnerMember.name}</strong>
                        <span>{selectedPartnerMember.category || "Sin categoría"} · {selectedPartnerMember.preferred_side || "lado indiferente"}</span>
                        {selectedPartnerMember.phone && <small>{selectedPartnerMember.phone}</small>}
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section className={`registration-step-card ${!selectedEventId ? "disabled" : ""}`}>
                <div className="step-card-head">
                  <span>3</span>
                  <div>
                    <h3>Confirma tu inscripción</h3>
                    <p>Marca pagos si ya fueron recibidos y deja la pareja lista para el evento.</p>
                  </div>
                </div>
                <div className="payment-row-grid">
                  <label className="payment-toggle">
                    <input
                      type="checkbox"
                      checked={form.paid}
                      onChange={(e) => setForm({ ...form, paid: e.target.checked })}
                    />
                    <span>
                      <strong>Jugador pagó</strong>
                      <small>{authUser?.name || form.name}</small>
                    </span>
                  </label>
                  {hasPartner && (
                    <label className="payment-toggle">
                      <input
                        type="checkbox"
                        checked={form.partner_paid}
                        onChange={(e) => setForm({ ...form, partner_paid: e.target.checked })}
                      />
                      <span>
                        <strong>Partner pagó</strong>
                        <small>{form.partner_name || "Selecciona partner"}</small>
                      </span>
                    </label>
                  )}
                </div>
                <button className="registration-submit" disabled={loading || !canSubmitRegistration}>
                  <UserPlus size={16} /> {loading ? "Registrando..." : isWaitlist ? "Entrar a lista de espera" : "Confirmar inscripción"}
                </button>
              </section>
            </main>

            <aside className="registration-live-summary">
              <div className="summary-player-card">
                <span>Jugador</span>
                <strong>{authUser?.name || form.name}</strong>
                <small>{authUser?.email || form.email}</small>
              </div>
              <div className={`summary-event-card ${isWaitlist ? "waitlist" : ""}`}>
                <span>{isWaitlist ? "Lista de espera" : "Cupos disponibles"}</span>
                <strong>{selectedEvent ? availableSpots : "-"}</strong>
                <small>{selectedEvent?.name || "Selecciona un evento"}</small>
              </div>
              <div className="summary-line-card">
                <span>Categoría</span>
                <strong>{selectedCategory || "Pendiente"}</strong>
                <small>{form.preferred_side || "indiferente"}</small>
              </div>
              <div className="summary-line-card">
                <span>Partner</span>
                <strong>{hasPartner ? (form.partner_name || "Pendiente") : "Buscando partner"}</strong>
                <small>{hasPartner ? "Pareja completa" : "Inscripción individual"}</small>
              </div>
              <div className="summary-line-card">
                <span>Pagos marcados</span>
                <strong>{formPaymentCount}/{hasPartner ? 2 : 1}</strong>
                <small>Editable por la organización después.</small>
              </div>
              <section className="registered-list compact">
                <div className="block-head">
                  <h2><ListChecks size={18} /> Inscritos</h2>
                  <span>{selectedEventPairs.length} parejas</span>
                </div>
                <div className="registered-list-items">
                  {selectedEventPairs.length ? selectedEventPairs.map((pair) => (
                    <div key={pair.id} className="registered-list-item">
                      <strong>{pairName(pair)}</strong>
                      <small>{pair.category} · {pair.status === "lista_espera" ? "Lista de espera" : pair.status === "buscando_partner" ? "Buscando partner" : "Pareja completa"}</small>
                    </div>
                  )) : <p className="muted">Sin inscritos todavia</p>}
                </div>
              </section>
            </aside>
          </form>
        )}
      </div>
    </section>
  );
}

function CategorySelect({ value, onChange }) {
  const allCategories = [...categoryOptions.hombre, ...categoryOptions.mujer];
  const hasCustomValue = value && !allCategories.includes(value);

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">Categoría</option>
      {hasCustomValue && <option value={value}>{value}</option>}
      <optgroup label="Hombres">
        {categoryOptions.hombre.map((category) => <option key={`h-${category}`} value={category}>{category}</option>)}
      </optgroup>
      <optgroup label="Mujeres">
        {categoryOptions.mujer.map((category) => <option key={`f-${category}`} value={category}>{category}</option>)}
      </optgroup>
    </select>
  );
}

function pairLevelStyle(level) {
  const tone = pairLevelTone(level);
  const palette = {
    low: ["#e8f8d8", "#4d7c0f"],
    mid: ["#fff6c7", "#8a6500"],
    high: ["#ffd5dd", "#a01743"],
  };
  const [background, color] = palette[tone];
  return { "--level-bg": background, "--level-color": color };
}

function pairLevelTone(level) {
  const normalized = Number(level || 6);
  if (normalized <= 4) return "low";
  if (normalized >= 8) return "high";
  return "mid";
}

function pairLevelLabel(level) {
  return pairLevelOptions.find((option) => option.tone === pairLevelTone(level))?.label || "Medio";
}

function PairLevelSelect({ value, onChange }) {
  const normalized = pairLevelOptions.find((option) => option.tone === pairLevelTone(value))?.value || 6;
  return (
    <select className={`pair-level-select ${pairLevelTone(normalized)}`} value={normalized} onChange={(event) => onChange(Number(event.target.value))}>
      {pairLevelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function PairLevelBadge({ level, compact = false }) {
  return (
    <span className={`pair-level-badge ${compact ? "compact" : ""}`} style={pairLevelStyle(level)}>
      {pairLevelLabel(level)}
    </span>
  );
}

function DataBlock({ title, rows }) {
  return (
    <article className="data-block">
      <h3>{title}</h3>
      {rows.length ? rows.map((row, index) => <p key={`${row}-${index}`}>{row}</p>) : <p className="muted">Sin registros</p>}
    </article>
  );
}

function PairsBlock({ pairs, participantOptions, payments = [], registrations = [], eventId, onChange, confirmAction }) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [showAddPair, setShowAddPair] = useState(false);
  const [addPairMode, setAddPairMode] = useState("registered");
  const [newPair, setNewPair] = useState({
    player_one_id: "",
    player_two_id: "",
    player_one_name: "",
    player_one_phone: "",
    player_two_name: "",
    player_two_phone: "",
    category: "",
    skill_level: "6",
    status: "completa",
  });
  const normalizedQuery = query.trim().toLowerCase();
  const categories = organizationCategories(pairs);
  const defaultNewPairCategory = newPair.category || categories[0] || "5taD+";
  const filteredPairs = pairs.filter((pair) => (
    (categoryFilter === "all" || pair.category === categoryFilter)
    && (statusFilter === "all" || pair.status === statusFilter)
    && (!normalizedQuery || pairName(pair).toLowerCase().includes(normalizedQuery))
  ));
  const completePairs = filteredPairs.filter((pair) => pair.status === "completa");
  const searchingPairs = filteredPairs.filter((pair) => pair.status === "buscando_partner" || !pair.player_two_id);
  const waitlistPairs = filteredPairs.filter((pair) => pair.status === "lista_espera");
  const sections = [
    ["Parejas completas", completePairs],
    ["Buscando partner", searchingPairs],
    ["Lista de espera", waitlistPairs],
  ];

  async function createManualPlayer(name, phone, category) {
    const player = await api.createPlayer({
      name: name.trim(),
      phone: phone.trim() || null,
      category,
      preferred_side: "indiferente",
    });
    return player.id;
  }

  async function submitNewPair(event) {
    event.preventDefault();
    await onChange(async () => {
      const category = defaultNewPairCategory;
      let playerOneId = null;
      let playerTwoId = null;

      if (addPairMode === "registered") {
        playerOneId = await resolveParticipantPlayerId(newPair.player_one_id, participantOptions, category);
        playerTwoId = newPair.player_two_id
          ? await resolveParticipantPlayerId(newPair.player_two_id, participantOptions, category)
          : null;
      } else {
        playerOneId = await createManualPlayer(newPair.player_one_name, newPair.player_one_phone, category);
        playerTwoId = newPair.player_two_name.trim()
          ? await createManualPlayer(newPair.player_two_name, newPair.player_two_phone, category)
          : null;
      }

      await api.createPair(eventId, {
        player_one_id: playerOneId,
        player_two_id: playerTwoId,
        category,
        skill_level: Number(newPair.skill_level || 6),
        status: playerTwoId ? newPair.status : "buscando_partner",
      });
    });
    setNewPair({
      player_one_id: "",
      player_two_id: "",
      player_one_name: "",
      player_one_phone: "",
      player_two_name: "",
      player_two_phone: "",
      category: defaultNewPairCategory,
      skill_level: "6",
      status: "completa",
    });
    setShowAddPair(false);
  }

  return (
    <article className="data-block pairs-block">
      <div className="block-head">
        <h3>Inscritos</h3>
        <div className="pairs-head-actions">
          <div className="mini-stats">
            <span>{pairs.filter((pair) => pair.status === "completa").length} completas</span>
            <span>{pairs.filter((pair) => pair.status === "buscando_partner" || !pair.player_two_id).length} buscando</span>
            <span>{pairs.filter((pair) => pair.status === "lista_espera").length} espera</span>
          </div>
          <button type="button" className="secondary-action" onClick={() => setShowAddPair((current) => !current)}>
            <UserPlus size={16} /> Agregar pareja
          </button>
        </div>
      </div>
      {showAddPair && (
        <form className="pair-create-panel" onSubmit={submitNewPair}>
          <div className="pair-create-mode">
            <button
              type="button"
              className={addPairMode === "registered" ? "active" : ""}
              onClick={() => setAddPairMode("registered")}
            >
              Inscrita/cuenta
            </button>
            <button
              type="button"
              className={addPairMode === "manual" ? "active" : ""}
              onClick={() => setAddPairMode("manual")}
            >
              Manual
            </button>
          </div>
          {addPairMode === "registered" ? (
            <>
              <label className="form-field">
                <span>Jugador 1</span>
                <select value={newPair.player_one_id} onChange={(event) => setNewPair({ ...newPair, player_one_id: event.target.value })} required>
                  <option value="">Seleccionar</option>
                  {participantOptions.map((option) => <option key={option.value} value={option.value}>{option.name}{option.kind === "member" ? " · cuenta" : ""}</option>)}
                </select>
              </label>
              <label className="form-field">
                <span>Jugador 2</span>
                <select value={newPair.player_two_id} onChange={(event) => setNewPair({ ...newPair, player_two_id: event.target.value })}>
                  <option value="">Sin partner</option>
                  {participantOptions
                    .filter((option) => option.value !== newPair.player_one_id)
                    .map((option) => <option key={option.value} value={option.value}>{option.name}{option.kind === "member" ? " · cuenta" : ""}</option>)}
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="form-field">
                <span>Jugador 1</span>
                <input value={newPair.player_one_name} onChange={(event) => setNewPair({ ...newPair, player_one_name: event.target.value })} placeholder="Nombre" required />
              </label>
              <label className="form-field">
                <span>Teléfono 1</span>
                <input value={newPair.player_one_phone} onChange={(event) => setNewPair({ ...newPair, player_one_phone: event.target.value })} placeholder="+56..." />
              </label>
              <label className="form-field">
                <span>Jugador 2</span>
                <input value={newPair.player_two_name} onChange={(event) => setNewPair({ ...newPair, player_two_name: event.target.value })} placeholder="Nombre" />
              </label>
              <label className="form-field">
                <span>Teléfono 2</span>
                <input value={newPair.player_two_phone} onChange={(event) => setNewPair({ ...newPair, player_two_phone: event.target.value })} placeholder="+56..." />
              </label>
            </>
          )}
          <label className="form-field">
            <span>Categoría</span>
            <CategorySelect value={defaultNewPairCategory} onChange={(category) => setNewPair({ ...newPair, category })} />
          </label>
          <label className="form-field">
            <span>Nivel dupla</span>
            <PairLevelSelect value={newPair.skill_level} onChange={(level) => setNewPair({ ...newPair, skill_level: String(level) })} />
          </label>
          <label className="form-field">
            <span>Estado</span>
            <select value={newPair.status} onChange={(event) => setNewPair({ ...newPair, status: event.target.value })}>
              <option value="completa">Completa</option>
              <option value="buscando_partner">Buscando partner</option>
              <option value="lista_espera">Lista de espera</option>
            </select>
          </label>
          <button type="submit">
            <Users size={16} /> Crear pareja
          </button>
        </form>
      )}
      <div className="pairs-toolbar">
        <input
          type="search"
          placeholder="Buscar pareja"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">Todas las categorías</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">Todos los estados</option>
          <option value="completa">Completas</option>
          <option value="buscando_partner">Buscando partner</option>
          <option value="lista_espera">Lista de espera</option>
        </select>
        <span>{filteredPairs.length} visibles</span>
      </div>
      {filteredPairs.length ? (
        <div className="pairs-list">
          {sections.map(([title, sectionPairs]) => (
            sectionPairs.length > 0 && (
              <section className="pair-section" key={title}>
                <strong>{title}</strong>
                {sectionPairs.map((pair) => (
                  <div className="pair-admin-row" key={pair.id}>
                    <div className="pair-operational-badges">
                      <span className={pairPaymentState(payments, pair.id).state}>{pairPaymentState(payments, pair.id).label}</span>
                      <span className={pairCheckInState(registrations, pair.id).state}>{pairCheckInState(registrations, pair.id).label}</span>
                    </div>
                    <select
                      value={`player:${pair.player_one_id}`}
                      onChange={(event) => onChange(async () => {
                        const playerOneId = await resolveParticipantPlayerId(event.target.value, participantOptions, pair.category);
                        await api.updatePair(eventId, pair.id, {
                          player_one_id: playerOneId,
                        });
                      })}
                    >
                      {participantOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.name}{option.kind === "member" ? " · cuenta" : ""}
                        </option>
                      ))}
                    </select>
                    <select
                      value={pair.player_two_id ? `player:${pair.player_two_id}` : ""}
                      onChange={(event) => {
                        onChange(async () => {
                          const playerTwoId = event.target.value
                            ? await resolveParticipantPlayerId(event.target.value, participantOptions, pair.category)
                            : null;
                          await api.updatePair(eventId, pair.id, {
                            player_two_id: playerTwoId,
                            status: playerTwoId ? "completa" : "buscando_partner",
                          });
                        });
                      }}
                    >
                      <option value="">Sin partner</option>
                      {participantOptions
                        .filter((option) => option.value !== `player:${pair.player_one_id}`)
                        .map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.name}{option.kind === "member" ? " · cuenta" : ""}
                          </option>
                        ))}
                    </select>
                    <CategorySelect
                      value={pair.category}
                      onChange={(category) => onChange(() => api.updatePair(eventId, pair.id, { category }))}
                    />
                    <PairLevelSelect
                      value={pair.skill_level}
                      onChange={(level) => onChange(() => api.updatePair(eventId, pair.id, { skill_level: level }))}
                    />
                    <select
                      value={pair.status}
                      onChange={(event) => onChange(() => api.updatePair(eventId, pair.id, { status: event.target.value }))}
                    >
                      <option value="completa">Completa</option>
                      <option value="buscando_partner">Buscando partner</option>
                      <option value="lista_espera">Lista de espera</option>
                    </select>
                    <button
                      className="danger-action"
                      type="button"
                      onClick={() => {
                        confirmAction({
                          tone: "danger",
                          title: "Eliminar pareja",
                          message: `Se eliminará ${pairName(pair)} del evento junto con sus partidos y resultados asociados.`,
                          confirmLabel: "Eliminar pareja",
                          onConfirm: async () => {
                            await onChange(() => api.deletePair(eventId, pair.id));
                          },
                        });
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </section>
            )
          ))}
        </div>
      ) : (
        <p className="muted">Sin inscritos con esos filtros.</p>
      )}
    </article>
  );
}

function paymentPlayerName(payment, pair, players) {
  if (payment.player?.name) return payment.player.name;
  const player = players.find((item) => item.id === payment.player_id);
  if (player) return player.name;
  if (pair?.player_one_id === payment.player_id) return pair.player_one.name;
  if (pair?.player_two_id === payment.player_id) return pair.player_two?.name || "Jugador";
  return "Jugador";
}

function PaymentBlock({ payments, pairs, players, eventId, onChange }) {
  return (
    <article className="data-block">
      <h3><CreditCard size={16} /> Pagos</h3>
      {payments.map((payment) => {
        const pair = payment.pair || pairs.find((item) => item.id === payment.pair_id);
        const playerName = paymentPlayerName(payment, pair, players);
        return (
          <div className="payment-row" key={payment.id}>
            <span>
              <strong>{playerName}</strong>
              <small>{pair ? pairName(pair) : `Pareja ${payment.pair_id}`}</small>
            </span>
            <select
              value={payment.status}
              onChange={(e) => onChange(() => api.updatePayment(eventId, payment.id, { status: e.target.value }))}
            >
              <option value="pendiente">Pendiente</option>
              <option value="abonado">Abonado</option>
              <option value="pagado">Pagado</option>
            </select>
          </div>
        );
      })}
    </article>
  );
}

function RankingFormulaPanel({ config }) {
  const mergedConfig = { ...defaultRankingConfig, ...(config || {}) };
  const tiebreakers = mergedConfig.tiebreakers?.length ? mergedConfig.tiebreakers : defaultRankingConfig.tiebreakers;
  const labels = Object.fromEntries(rankingTiebreakerOptions.map((option) => [option.value, option.label]));

  return (
    <article className="ranking-formula-panel">
      <div className="ranking-formula-main">
        <span>Fórmula de puntos</span>
        <strong>PTS = (G × {mergedConfig.win_points}) + (E × {mergedConfig.draw_points}) + (P × {mergedConfig.loss_points})</strong>
        <small>Cada categoría se calcula y ordena por separado.</small>
      </div>
      <div className="ranking-formula-definitions">
        <span><strong>J</strong> Jugados</span>
        <span><strong>G</strong> Ganados</span>
        <span><strong>E</strong> Empatados = J − G − P</span>
        <span><strong>P</strong> Perdidos</span>
        <span><strong>PF</strong> Juegos a favor</span>
        <span><strong>PC</strong> Juegos en contra</span>
        <span><strong>DIF</strong> PF − PC</span>
        <span><strong>PTS</strong> Puntos de clasificación</span>
      </div>
      <div className="ranking-order-formula">
        <span>Orden aplicado</span>
        <ol>
          {tiebreakers.map((criterion, index) => <li key={`${criterion}-${index}`}>{labels[criterion] || criterion}</li>)}
        </ol>
        <small>Si dos parejas siguen iguales después del último criterio, el sistema conserva su orden interno y asigna posiciones consecutivas.</small>
      </div>
    </article>
  );
}

const rankingCriterionDetails = {
  points: {
    label: "Puntos de clasificación",
    value: (standing) => standing.points,
    format: (value) => `${value} pts`,
  },
  won: {
    label: "Partidos ganados",
    value: (standing) => standing.won,
    format: (value) => `${value} ganado${value === 1 ? "" : "s"}`,
  },
  difference: {
    label: "Diferencia de juegos",
    value: (standing) => standing.points_for - standing.points_against,
    format: (value) => `${value > 0 ? "+" : ""}${value}`,
  },
  points_for: {
    label: "Juegos a favor",
    value: (standing) => standing.points_for,
    format: (value) => `${value} juegos`,
  },
  played: {
    label: "Partidos jugados",
    value: (standing) => standing.played,
    format: (value) => `${value} jugados`,
  },
};

function humanList(items) {
  if (items.length < 2) return items[0] || "";
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

function standingNames(standings) {
  return humanList(standings.map((standing) => pairName(standing.pair)));
}

function finalFixtureMatchLabel(roundName) {
  if (/Final oro y plata/i.test(roundName || "")) return "Oro y plata";
  if (/Partido por bronce/i.test(roundName || "")) return "Bronce y 4.º lugar";
  const positions = (roundName || "").match(/Definición puestos\s+(\d+)\s+y\s+(\d+)/i);
  return positions ? `Puestos ${positions[1]} y ${positions[2]}` : "Definición de posiciones";
}

function finalMatchFormatLabel(roundName) {
  return /Tiebreak a 7/i.test(roundName || "") ? "Tiebreak a 7" : "Partido normal";
}

function applyFinalMatchFormat(match, format) {
  if (format !== "tiebreak") return match;
  const timeMatch = match.round_name.match(/\s-\s(\d{1,2}:\d{2}-\d{1,2}:\d{2})$/);
  const roundName = timeMatch
    ? match.round_name.replace(timeMatch[0], ` - Tiebreak a 7 - ${timeMatch[1]}`)
    : `${match.round_name} - Tiebreak a 7`;
  return { ...match, round_name: roundName };
}

function FinalFixturePanel({ plans, pairs, expanded, setExpanded, loading, onGenerate }) {
  const [finalMatchFormat, setFinalMatchFormat] = useState("normal");
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
  const proposedMatches = plans.flatMap((plan) => plan.proposedMatches.map((match) => applyFinalMatchFormat(match, finalMatchFormat)));
  const hasExistingFixture = plans.some((plan) => plan.existingMatches.length);
  const allCategoriesReady = plans.length > 0 && plans.every((plan) => plan.ready || plan.existingMatches.length);

  return (
    <article className="final-fixture-panel">
      <div className="final-fixture-head">
        <div>
          <span>Quinta ronda</span>
          <h3><Trophy size={18} /> Fixture final por posiciones</h3>
          <p>El ranking actual siembra cruces 1.º–2.º, 3.º–4.º y así sucesivamente para definir el orden final completo.</p>
        </div>
        <button type="button" className="secondary-action" onClick={() => setExpanded(!expanded)}>
          <Swords size={17} /> {expanded ? "Ocultar fixture" : hasExistingFixture ? "Ver fixture final" : "Armar fixture final"}
        </button>
      </div>

      {expanded && (
        <div className="final-fixture-body">
          {proposedMatches.length > 0 && (
            <div className="final-format-control">
              <div>
                <strong>Formato de la quinta ronda</strong>
                <span>Define cómo se jugarán todos los partidos que ordenan las posiciones finales.</span>
              </div>
              <select value={finalMatchFormat} onChange={(event) => setFinalMatchFormat(event.target.value)}>
                <option value="normal">Partido normal</option>
                <option value="tiebreak">Tiebreak a 7 puntos</option>
              </select>
            </div>
          )}
          <div className="final-fixture-status-grid">
            {plans.map((plan) => (
              <section className={plan.ready || plan.existingMatches.length ? "ready" : "blocked"} key={plan.category}>
                <div>
                  <strong>{plan.category}</strong>
                  <span>{plan.existingMatches.length ? "Fixture generado" : plan.ready ? `${plan.proposedMatches.length} partidos listos` : "Aún no disponible"}</span>
                </div>
                <small>{plan.existingMatches.length ? `${plan.existingMatches.length} cruces en ronda 5` : plan.reason || `${plan.slot} · ${plan.requiredCourts} canchas`}</small>
              </section>
            ))}
          </div>

          {plans.map((plan) => {
            const fixtureMatches = plan.existingMatches.length
              ? plan.existingMatches
              : plan.proposedMatches.map((match) => applyFinalMatchFormat(match, finalMatchFormat));
            return fixtureMatches.length ? (
              <section className="final-fixture-category" key={`${plan.category}-preview`}>
                <header>
                  <div><strong>{plan.category}</strong><span>{plan.slot}</span></div>
                  <span>{fixtureMatches.length} partidos · {plan.courts.length} canchas detectadas</span>
                </header>
                <div className="final-fixture-match-grid">
                  {fixtureMatches.map((match) => (
                    <article key={`${match.round_name}-${match.court}-${match.pair_one_id}`}>
                      <div><span>Cancha {match.court}</span><strong>{finalFixtureMatchLabel(match.round_name)}</strong><em>{finalMatchFormatLabel(match.round_name)}</em></div>
                      <p>{pairName(pairById.get(match.pair_one_id))}</p>
                      <b>vs</b>
                      <p>{pairName(pairById.get(match.pair_two_id))}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null;
          })}

          {!allCategoriesReady && (
            <div className="final-fixture-warning">
              <AlertCircle size={18} />
              <span>Completa los resultados pendientes o revisa la disponibilidad de canchas antes de crear la ronda final.</span>
            </div>
          )}

          {proposedMatches.length > 0 && (
            <div className="final-fixture-actions">
              <span>Se crearán {proposedMatches.length} partidos en una sola ronda, sin reemplazar la programación existente.</span>
              <button type="button" disabled={!allCategoriesReady || !proposedMatches.length || loading} onClick={() => onGenerate(proposedMatches)}>
                <Save size={17} /> Guardar ronda final
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function FinalRankingBlock({ categories }) {
  if (!categories.length) return null;

  return (
    <article className="final-ranking-block">
      <div className="block-head">
        <div>
          <h3><Trophy size={18} /> Ranking final del evento</h3>
          <p className="muted">Cada cruce de la quinta ronda fija dos posiciones definitivas.</p>
        </div>
      </div>
      <div className="final-ranking-grid">
        {categories.map((category) => (
          <section key={category.category}>
            <header><strong>{category.category}</strong><span>{category.completedMatches}/{category.totalMatches} partidos cerrados</span></header>
            {category.ready ? category.placements.map((placement) => (
              <div className={`final-ranking-row position-${placement.position}`} key={`${category.category}-${placement.position}`}>
                <span>{placement.position}</span>
                <strong>{pairName(placement.pair)}</strong>
                <small>{placement.position === 1 ? "Oro" : placement.position === 2 ? "Plata" : placement.position === 3 ? "Bronce" : "Posición final"}</small>
              </div>
            )) : (
              <div className="final-ranking-pending">
                <Clock size={18} />
                <span>El ranking final aparecerá al cerrar todos los partidos de definición sin empates.</span>
              </div>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}

function buildTieExplanation(group, tiebreakers) {
  let unresolved = [group];
  const steps = [];

  for (const criterion of tiebreakers) {
    const detail = rankingCriterionDetails[criterion];
    if (!detail || !unresolved.length) continue;
    const nextUnresolved = [];

    unresolved.forEach((subgroup) => {
      const buckets = new Map();
      subgroup.forEach((standing) => {
        const value = detail.value(standing);
        buckets.set(value, [...(buckets.get(value) || []), standing]);
      });

      if (buckets.size === 1) {
        const value = detail.value(subgroup[0]);
        steps.push({
          tone: "tied",
          criterion: detail.label,
          text: `${standingNames(subgroup)} continuaron empatadas: todas registraron ${detail.format(value)}.`,
        });
        nextUnresolved.push(subgroup);
        return;
      }

      const orderedBuckets = [...buckets.entries()].sort((left, right) => right[0] - left[0]);
      steps.push({
        tone: "resolved",
        criterion: detail.label,
        text: `Este criterio ordenó el grupo: ${orderedBuckets.map(([value, standings]) => `${standingNames(standings)} (${detail.format(value)})`).join("; ")}.`,
      });
      orderedBuckets.forEach(([, standings]) => {
        if (standings.length > 1) nextUnresolved.push(standings);
      });
    });

    unresolved = nextUnresolved;
  }

  unresolved.forEach((subgroup) => {
    steps.push({
      tone: "unresolved",
      criterion: "Igualdad total",
      text: `${standingNames(subgroup)} terminaron iguales en todos los criterios configurados. El sistema mantuvo su orden interno para asignar posiciones consecutivas.`,
    });
  });

  return steps;
}

function RankingExplanation({ standings, config }) {
  const mergedConfig = { ...defaultRankingConfig, ...(config || {}) };
  const tiebreakers = mergedConfig.tiebreakers?.length ? mergedConfig.tiebreakers : defaultRankingConfig.tiebreakers;
  const byCategory = standings.reduce((groups, standing) => {
    const category = standing.pair.category || "Sin categoría";
    groups[category] = [...(groups[category] || []), standing].sort((left, right) => left.position - right.position);
    return groups;
  }, {});

  return (
    <details className="ranking-explanation">
      <summary>
        <div>
          <h3><ListChecks size={16} /> Explicación de clasificación</h3>
          <p className="muted">Cómo se resolvió el orden dentro de cada categoría.</p>
        </div>
        <span>detalle</span>
      </summary>
      <div className="ranking-explanation-grid">
        {Object.entries(byCategory).map(([category, categoryStandings]) => {
          const tiesByPoints = Object.values(categoryStandings.reduce((groups, standing) => {
            groups[standing.points] = [...(groups[standing.points] || []), standing];
            return groups;
          }, {}))
            .filter((group) => group.length > 1)
            .sort((left, right) => Math.min(...left.map((standing) => standing.position)) - Math.min(...right.map((standing) => standing.position)));

          return (
            <section className="ranking-category-explanation" key={category}>
              <header>
                <strong>{category}</strong>
                <span>{tiesByPoints.length ? `${tiesByPoints.length} empate${tiesByPoints.length === 1 ? "" : "s"} analizado${tiesByPoints.length === 1 ? "" : "s"}` : "Sin empates"}</span>
              </header>
              {!tiesByPoints.length ? (
                <div className="ranking-no-ties">
                  <Check size={18} />
                  <p><strong>El orden se definió únicamente por puntos.</strong> Ninguna pareja terminó con el mismo puntaje de clasificación.</p>
                </div>
              ) : tiesByPoints.map((group) => {
                const positions = group.map((standing) => standing.position).sort((a, b) => a - b);
                const steps = buildTieExplanation(group, tiebreakers);
                return (
                  <article className="ranking-tie-story" key={`${category}-${group[0].points}-${positions.join("-")}`}>
                    <div className="ranking-tie-summary">
                      <span>Posiciones {humanList(positions)}</span>
                      <strong>{standingNames(group)}</strong>
                      <small>Empataron con {group[0].points} puntos de clasificación.</small>
                    </div>
                    <ol>
                      {steps.map((step, index) => (
                        <li className={step.tone} key={`${step.criterion}-${index}`}>
                          <span>{index + 1}</span>
                          <div><strong>{step.criterion}</strong><p>{step.text}</p></div>
                        </li>
                      ))}
                    </ol>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </details>
  );
}

function PairPerformanceModal({ standing, matches, pairs, onClose }) {
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
  const pairId = standing.pair_id || standing.pair.id;
  const pairMatches = matches
    .filter((match) => match.pair_one_id === pairId || match.pair_two_id === pairId)
    .sort((left, right) => minutesFromMatch(left) - minutesFromMatch(right) || left.id - right.id);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="pair-performance-modal" role="dialog" aria-modal="true" aria-labelledby="pair-performance-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span>{standing.pair.category} · Posición {standing.position}</span>
            <h2 id="pair-performance-title">{pairName(standing.pair)}</h2>
            <p>Detalle de los partidos que construyen su clasificación actual.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar detalle de la dupla"><X size={18} /></button>
        </header>

        <div className="pair-performance-kpis">
          <div><span>Jugados</span><strong>{standing.played}</strong></div>
          <div><span>Ganados</span><strong>{standing.won}</strong></div>
          <div><span>Empatados</span><strong>{standing.played - standing.won - standing.lost}</strong></div>
          <div><span>Diferencia</span><strong>{standing.points_for - standing.points_against > 0 ? "+" : ""}{standing.points_for - standing.points_against}</strong></div>
          <div><span>Puntos</span><strong>{standing.points}</strong></div>
        </div>

        <div className="pair-match-history">
          <div className="pair-match-history-head">
            <strong>Historial de partidos</strong>
            <span>{pairMatches.filter(matchHasResult).length}/{pairMatches.length} con resultado</span>
          </div>
          {pairMatches.map((match, index) => {
            const isPairOne = match.pair_one_id === pairId;
            const opponent = pairById.get(isPairOne ? match.pair_two_id : match.pair_one_id);
            const ownScore = isPairOne ? match.pair_one_score : match.pair_two_score;
            const opponentScore = isPairOne ? match.pair_two_score : match.pair_one_score;
            const completed = matchHasResult(match);
            const result = !completed ? "pending" : Number(ownScore) > Number(opponentScore) ? "win" : Number(ownScore) < Number(opponentScore) ? "loss" : "draw";
            const schedule = parseFixtureRoundLabel(match.round_name);
            return (
              <article className={`pair-match-item ${result}`} key={match.id}>
                <div className="pair-match-sequence">
                  <span>{index + 1}</span>
                  <small>{schedule.time || schedule.turn}</small>
                </div>
                <div className="pair-match-opponent">
                  <span>vs</span>
                  <strong>{opponent ? pairName(opponent) : `Pareja ${isPairOne ? match.pair_two_id : match.pair_one_id}`}</strong>
                  <small>Cancha {match.court || "-"}{/Tiebreak a 7/i.test(match.round_name || "") ? " · Tiebreak a 7" : ""}</small>
                </div>
                <div className="pair-match-score">
                  <strong>{completed ? `${ownScore}–${opponentScore}` : "Pendiente"}</strong>
                  <span>{result === "win" ? "Victoria" : result === "loss" ? "Derrota" : result === "draw" ? "Empate" : "Sin jugar"}</span>
                </div>
              </article>
            );
          })}
          {!pairMatches.length && <div className="pair-match-empty">Esta dupla todavía no tiene partidos programados.</div>}
        </div>
      </section>
    </div>,
    document.body,
  );
}

function RankingBlock({ ranking, standings, matches = [], pairs = [], detailed = false }) {
  const [selectedStanding, setSelectedStanding] = useState(null);
  const standingsByCategory = standings.reduce((groups, standing) => {
    const category = standing.pair.category || "Sin categoria";
    groups[category] = [...(groups[category] || []), standing];
    return groups;
  }, {});

  return (
    <article className="data-block">
      <h3><Medal size={16} /> Ranking</h3>
      {Object.entries(standingsByCategory).length ? (
        <div className={`ranking-grid ${detailed ? "detailed" : ""}`}>
          {Object.entries(standingsByCategory).map(([category, categoryStandings]) => (
            <article className={`ranking-table ${detailed ? "detailed" : ""}`} key={category}>
              <div className="ranking-title">
                <strong>{category}</strong>
                <span>{categoryStandings.length} parejas</span>
              </div>
              <div className={`ranking-row ranking-header ${detailed ? "detailed" : ""}`}>
                <span>#</span>
                <span>Pareja</span>
                <span>J</span>
                <span>G</span>
                {detailed && <span>E</span>}
                {detailed && <span>P</span>}
                {detailed && <span>PF</span>}
                {detailed && <span>PC</span>}
                <span>Dif</span>
                <span>Pts</span>
              </div>
              {categoryStandings.map((standing) => (
                <div
                  className={`ranking-row ranking-drill-row ${detailed ? "detailed" : ""}`}
                  key={standing.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Ver partidos de ${pairName(standing.pair)}`}
                  onClick={() => setSelectedStanding(standing)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedStanding(standing);
                    }
                  }}
                >
                  <span>{standing.position}</span>
                  <span className="ranking-pair-name">{pairName(standing.pair)} <Eye size={14} /></span>
                  <span>{standing.played}</span>
                  <span>{standing.won}</span>
                  {detailed && <span>{standing.played - standing.won - standing.lost}</span>}
                  {detailed && <span>{standing.lost}</span>}
                  {detailed && <span>{standing.points_for}</span>}
                  {detailed && <span>{standing.points_against}</span>}
                  <span>{standing.points_for - standing.points_against}</span>
                  <span>{standing.points}</span>
                </div>
              ))}
            </article>
          ))}
        </div>
      ) : (
        (ranking.length ? ranking : []).map((standing) => (
          <p key={standing.id}>{standing.position}. {pairName(standing.pair)} - {standing.points} pts</p>
        ))
      )}
      {selectedStanding && (
        <PairPerformanceModal standing={selectedStanding} matches={matches} pairs={pairs} onClose={() => setSelectedStanding(null)} />
      )}
    </article>
  );
}

function PostEventSummary({ event, standings, matches, pairs }) {
  const [copied, setCopied] = useState(false);
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
  const completedMatches = matches.filter(matchHasResult);
  const standingsByCategory = standings.reduce((groups, standing) => {
    const category = standing.pair.category || "Sin categoria";
    groups[category] = [...(groups[category] || []), standing].sort((left, right) => (left.position || 999) - (right.position || 999));
    return groups;
  }, {});
  const closeMatches = completedMatches
    .map((match) => {
      const pairOne = pairById.get(match.pair_one_id);
      const pairTwo = pairById.get(match.pair_two_id);
      return {
        match,
        diff: Math.abs(Number(match.pair_one_score || 0) - Number(match.pair_two_score || 0)),
        label: `${pairOne ? pairName(pairOne) : `Pareja ${match.pair_one_id}`} ${match.pair_one_score}-${match.pair_two_score} ${pairTwo ? pairName(pairTwo) : `Pareja ${match.pair_two_id}`}`,
      };
    })
    .sort((left, right) => left.diff - right.diff)
    .slice(0, 5);
  const totalPairs = pairs.filter((pair) => pair.status !== "lista_espera").length;
  const shareText = [
    `*${event?.name || "Evento AMAR"}*`,
    event?.date ? `Fecha: ${event.date}` : "",
    event?.place ? `Lugar: ${event.place}` : "",
    "",
    `Parejas: ${totalPairs}`,
    `Partidos jugados: ${completedMatches.length}/${matches.length}`,
    "",
    "*Podios*",
    ...Object.entries(standingsByCategory).flatMap(([category, categoryStandings]) => [
      "",
      `_${category}_`,
      ...categoryStandings.slice(0, 3).map((standing) => `${standing.position}. ${pairName(standing.pair)} - ${standing.points} pts`),
    ]),
    "",
    "*Partidos más cerrados*",
    ...(closeMatches.length ? closeMatches.map((item) => `- ${item.label}`) : ["- Sin resultados cargados"]),
  ].filter((line) => line !== "").join("\n");

  async function copySummary() {
    await navigator.clipboard.writeText(shareText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <article className="post-event-summary">
      <div className="block-head">
        <div>
          <h3><Trophy size={16} /> Post evento</h3>
          <p className="muted">Resumen listo para cerrar y compartir el evento.</p>
        </div>
        <button type="button" className="secondary-action" onClick={copySummary} disabled={!standings.length && !completedMatches.length}>
          <Clipboard size={16} /> {copied ? "Copiado" : "Copiar resumen"}
        </button>
      </div>

      <div className="post-event-kpis">
        <div>
          <strong>{totalPairs}</strong>
          <span>parejas</span>
        </div>
        <div>
          <strong>{completedMatches.length}/{matches.length}</strong>
          <span>partidos</span>
        </div>
        <div>
          <strong>{Object.keys(standingsByCategory).length}</strong>
          <span>categorías</span>
        </div>
      </div>

      <div className="post-event-grid">
        <section>
          <h3>Podios</h3>
          {Object.entries(standingsByCategory).length ? Object.entries(standingsByCategory).map(([category, categoryStandings]) => (
            <div className="podium-card" key={`podium-${category}`}>
              <strong>{category}</strong>
              {categoryStandings.slice(0, 3).map((standing) => (
                <p key={standing.id}>
                  <span>{standing.position}</span>
                  {pairName(standing.pair)}
                  <em>{standing.points} pts</em>
                </p>
              ))}
            </div>
          )) : <p className="empty">Recalcula el ranking para generar podios.</p>}
        </section>

        <section>
          <h3>Partidos cerrados</h3>
          {closeMatches.length ? closeMatches.map((item) => (
            <div className="close-match-card" key={item.match.id}>
              <strong>{item.label}</strong>
              <span>Dif {item.diff}</span>
            </div>
          )) : <p className="empty">Carga resultados para destacar partidos.</p>}
        </section>
      </div>

      <textarea className="post-event-share" value={shareText} readOnly />
    </article>
  );
}

function RankingConfigPanel({ config, setConfig, onSave }) {
  const mergedConfig = { ...defaultRankingConfig, ...(config || {}) };
  const tiebreakers = mergedConfig.tiebreakers?.length ? mergedConfig.tiebreakers : defaultRankingConfig.tiebreakers;

  function updatePoints(key, value) {
    setConfig({ ...mergedConfig, [key]: Number(value) });
  }

  function updateTiebreaker(index, value) {
    const next = [...tiebreakers];
    next[index] = value;
    setConfig({ ...mergedConfig, tiebreakers: next });
  }

  return (
    <article className="data-block ranking-config-panel">
      <div className="block-head">
        <h3><Medal size={16} /> Parámetros de ranking</h3>
        <button type="button" onClick={() => onSave(mergedConfig)}>Guardar y recalcular</button>
      </div>
      <div className="ranking-points-grid">
        <label className="form-field compact">
          <span>Victoria</span>
          <input type="number" value={mergedConfig.win_points} onChange={(event) => updatePoints("win_points", event.target.value)} />
        </label>
        <label className="form-field compact">
          <span>Empate</span>
          <input type="number" value={mergedConfig.draw_points} onChange={(event) => updatePoints("draw_points", event.target.value)} />
        </label>
        <label className="form-field compact">
          <span>Derrota</span>
          <input type="number" value={mergedConfig.loss_points} onChange={(event) => updatePoints("loss_points", event.target.value)} />
        </label>
      </div>
      <div className="ranking-tiebreakers">
        <span>Orden de desempate</span>
        {tiebreakers.map((criterion, index) => (
          <label className="form-field compact" key={`${criterion}-${index}`}>
            <span>{index + 1}. criterio</span>
            <select value={criterion} onChange={(event) => updateTiebreaker(index, event.target.value)}>
              {rankingTiebreakerOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </article>
  );
}

function PairSelect({ label, value, pairs, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">{label}</option>
      {pairs.map((pair) => <option key={pair.id} value={pair.id}>{pairName(pair)} · {pairLevelLabel(pair.skill_level)}</option>)}
    </select>
  );
}

function PlannerLevelChips({ pairOne, pairTwo }) {
  if (!pairOne && !pairTwo) return null;
  const diff = pairOne && pairTwo ? Math.abs(Number(pairOne.skill_level || 5) - Number(pairTwo.skill_level || 5)) : null;
  return (
    <div className="planner-level-chips">
      {pairOne && <PairLevelBadge level={pairOne.skill_level} />}
      {pairTwo && <PairLevelBadge level={pairTwo.skill_level} />}
      {diff !== null && (
        <span className={`level-gap ${diff <= 1 ? "ok" : diff <= 3 ? "watch" : "wide"}`}>
          dif {diff}
        </span>
      )}
    </div>
  );
}

function parseFixtureRound(roundName) {
  const parts = (roundName || "Sin categoria - Turno").split(" - ");
  const [categoryPart, groupPart] = parts;
  const lastPart = parts[parts.length - 1] || "";
  const hasTime = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(lastPart);
  const time = hasTime ? lastPart : "";
  const turnParts = (hasTime ? parts.slice(1, -1) : parts.slice(1)).filter(Boolean);
  return {
    category: categoryPart || "Sin categoria",
    group: groupPart || "",
    time,
    turn: turnParts.join(" - ") || roundName || "Turno",
  };
}

function normalizeCourt(court) {
  if (!court) return "Sin cancha";
  const value = String(court).trim();
  if (/^cancha\b/i.test(value)) {
    const [, number = ""] = value.split(/\s+/, 2);
    return number ? `Cancha ${number}` : "Cancha";
  }
  return `Cancha ${value}`;
}

function hasResult(match) {
  return match.pair_one_score !== null && match.pair_one_score !== undefined
    && match.pair_two_score !== null && match.pair_two_score !== undefined;
}

function minutesFromSlot(slot) {
  const start = (slot || "").split("-")[0];
  const [hours, minutes] = start.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 9999;
  return (hours * 60) + minutes;
}

function slotEndMinutes(slot) {
  const end = (slot || "").split("-")[1];
  const [hours, minutes] = (end || "").split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return (hours * 60) + minutes;
}

function fixtureCategoryFromPairs(pairOne, pairTwo, fallbackCategory) {
  if (pairOne?.category && pairTwo?.category) {
    return pairOne.category === pairTwo.category ? pairOne.category : `${pairOne.category} / ${pairTwo.category}`;
  }
  return fallbackCategory;
}

function isNumericScore(value) {
  return value !== null && value !== undefined && value !== "" && !Number.isNaN(Number(value));
}

function emptyStanding(pair) {
  return {
    pair,
    played: 0,
    won: 0,
    lost: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    points: 0,
  };
}

function standingDiff(standing) {
  return standing.pointsFor - standing.pointsAgainst;
}

function sortStandings(items) {
  return [...items].sort((a, b) => (
    b.points - a.points
    || b.won - a.won
    || standingDiff(b) - standingDiff(a)
    || b.pointsFor - a.pointsFor
    || (a.pair.seed || 9999) - (b.pair.seed || 9999)
    || a.pair.id - b.pair.id
  ));
}

function resolveMatchResult(match) {
  if (!match || !isNumericScore(match.pair_one_score) || !isNumericScore(match.pair_two_score)) {
    return { winnerId: null, loserId: null };
  }
  const oneScore = Number(match.pair_one_score);
  const twoScore = Number(match.pair_two_score);
  if (oneScore === twoScore) return { winnerId: null, loserId: null };
  return oneScore > twoScore
    ? { winnerId: match.pair_one_id, loserId: match.pair_two_id }
    : { winnerId: match.pair_two_id, loserId: match.pair_one_id };
}

function buildEmptyPlannerGrid(roundCount, courtCount) {
  return Array.from({ length: Math.max(1, Number(roundCount) || 1) }, () =>
    Array.from({ length: Math.max(1, Number(courtCount) || 1) }, () => ({ pair_one_id: "", pair_two_id: "" }))
  );
}

function pairCategoryOptions(pairs) {
  return [...new Set(pairs.filter((pair) => pair.status === "completa" && pair.player_two_id).map((pair) => pair.category))]
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function matchupKey(oneId, twoId) {
  return [Number(oneId), Number(twoId)].sort((a, b) => a - b).join("-");
}

function roundRobinMatches(pairIds) {
  if (pairIds.length < 2) return [];
  const teams = [...pairIds];
  if (teams.length % 2 === 1) teams.push(null);
  const rounds = [];

  for (let roundIndex = 0; roundIndex < teams.length - 1; roundIndex += 1) {
    const round = [];
    for (let index = 0; index < teams.length / 2; index += 1) {
      const one = teams[index];
      const two = teams[teams.length - 1 - index];
      if (one && two) round.push({ pair_one_id: String(one), pair_two_id: String(two) });
    }
    rounds.push(round);
    teams.splice(1, 0, teams.pop());
  }
  return rounds;
}

function plannerGroupLabels(count) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length: Math.max(1, Number(count) || 1) }, (_, index) => `Grupo ${letters[index] || index + 1}`);
}

function balancedGroupAssignments(pairs, groupCount) {
  const labels = plannerGroupLabels(groupCount);
  const orderedPairs = [...pairs].sort((left, right) => (
    Number(right.skill_level || 5) - Number(left.skill_level || 5)
    || (left.seed || 9999) - (right.seed || 9999)
    || left.id - right.id
  ));
  return orderedPairs.reduce((acc, pair, index) => {
    const cycle = index % (labels.length * 2);
    const labelIndex = cycle < labels.length ? cycle : labels.length - 1 - (cycle - labels.length);
    acc[String(pair.id)] = labels[labelIndex];
    return acc;
  }, {});
}

function getPlannerGroup(assignments, pairId) {
  return pairId ? assignments[String(pairId)] || "" : "";
}

function plannerSlotGroup(slot, assignments) {
  const oneGroup = getPlannerGroup(assignments, slot.pair_one_id);
  const twoGroup = getPlannerGroup(assignments, slot.pair_two_id);
  return oneGroup && oneGroup === twoGroup ? oneGroup : "";
}

function americanoFixedPairs(pairs = []) {
  const colors = [
    "#e5f6ff",
    "#e8f8df",
    "#fff1c7",
    "#ffe1d6",
    "#f0e4ff",
    "#dcf8f3",
    "#ffe3ef",
    "#e7ecff",
    "#f4efd8",
    "#dff4ea",
    "#fde7c8",
    "#e1f1f5",
  ];
  return pairs
    .filter((pair) => pair.status === "completa" && pair.player_two_id)
    .map((pair) => ({
      id: String(pair.id),
      pairId: pair.id,
      name: pairName(pair),
      shortName: pairName(pair),
      category: pair.category || "Sin categoria",
      level: Number(pair.skill_level || 5),
    }))
    .sort((left, right) => (
      String(left.category).localeCompare(String(right.category), undefined, { numeric: true })
      || left.level - right.level
      || left.name.localeCompare(right.name)
    ))
    .map((pair, index) => ({
      ...pair,
      color: colors[index % colors.length],
    }));
}

function americanoPairMatchKey(left, right) {
  return [left.id, right.id].sort().join("|");
}

function generateFixedPairAmericanoFixture({ pairs = [], startTime, endTime, matchMinutes = 20, courts = [] }) {
  const warnings = [];
  const usableCourts = courts.length ? courts : ["1"];
  const start = minutesFromSlot(startTime || "17:00");
  let end = minutesFromSlot(endTime || "");
  const validStart = start === 9999 ? 17 * 60 : start;
  if (end === 9999) {
    end = validStart + (Number(matchMinutes || 20) * 3);
    warnings.push("No hay hora de fin configurada; se simulan 3 rondas.");
  }
  if (end <= validStart) end += 24 * 60;

  const minutesPerMatch = Math.max(1, Number(matchMinutes || 20));
  const roundCount = Math.max(0, Math.floor((end - validStart) / minutesPerMatch));
  const maxCourtsByPairs = Math.max(0, Math.floor(pairs.length / 2));
  const courtsPerRound = Math.min(usableCourts.length, maxCourtsByPairs);
  const stats = new Map(pairs.map((pair) => [pair.id, {
    ...pair,
    matches: 0,
    rests: 0,
    rivalsSet: new Set(),
  }]));
  const matchupCounts = new Map();
  const rounds = [];

  if (pairs.length < 2) warnings.push("Se necesitan al menos 2 parejas completas para armar partidos.");
  if (pairs.length % 2 !== 0) warnings.push("Una pareja descansará en cada ronda por cantidad impar.");
  if (usableCourts.length > courtsPerRound && courtsPerRound > 0) warnings.push(`Se usarán ${courtsPerRound} de ${usableCourts.length} canchas por ronda según parejas disponibles.`);
  Object.entries(pairs.reduce((acc, pair) => {
    acc[pair.category] = (acc[pair.category] || 0) + 1;
    return acc;
  }, {})).forEach(([category, count]) => {
    if (count === 1) warnings.push(`${category} tiene solo 1 pareja; no puede generar cruces internos.`);
    else if (count % 2 !== 0) warnings.push(`${category} tiene cantidad impar; una pareja descansará por ronda.`);
  });

  for (let roundIndex = 0; roundIndex < roundCount && courtsPerRound > 0; roundIndex += 1) {
    const roundStart = validStart + (roundIndex * minutesPerMatch);
    const usedThisRound = new Set();
    const matches = [];

    for (let courtIndex = 0; courtIndex < courtsPerRound; courtIndex += 1) {
      let best = null;
      const pool = pairs.filter((pair) => !usedThisRound.has(pair.id));
      if (pool.length < 2) break;

      pool.forEach((one, oneIndex) => {
        pool.slice(oneIndex + 1).forEach((two) => {
          if (one.category !== two.category) return;
          const oneStats = stats.get(one.id);
          const twoStats = stats.get(two.id);
          const key = americanoPairMatchKey(one, two);
          const score = (
            ((matchupCounts.get(key) || 0) * 80)
            + (Math.abs(oneStats.matches - twoStats.matches) * 12)
            + (Math.abs(oneStats.rests - twoStats.rests) * 3)
            + (Math.abs(one.level - two.level) * 2)
            - ((oneStats.rests + twoStats.rests) * 0.5)
          );
          if (!best || score < best.score) best = { pair_one: one, pair_two: two, score };
        });
      });

      if (!best) break;

      matches.push({
        round: roundIndex + 1,
        court: usableCourts[courtIndex],
        start_time: minutesToTime(roundStart),
        end_time: minutesToTime(roundStart + minutesPerMatch),
        pair_one: best.pair_one,
        pair_two: best.pair_two,
        locked: false,
      });

      usedThisRound.add(best.pair_one.id);
      usedThisRound.add(best.pair_two.id);
      stats.get(best.pair_one.id).matches += 1;
      stats.get(best.pair_two.id).matches += 1;
      stats.get(best.pair_one.id).rivalsSet.add(best.pair_two.id);
      stats.get(best.pair_two.id).rivalsSet.add(best.pair_one.id);
      const key = americanoPairMatchKey(best.pair_one, best.pair_two);
      matchupCounts.set(key, (matchupCounts.get(key) || 0) + 1);
    }

    const resting = pairs.filter((pair) => !usedThisRound.has(pair.id));
    resting.forEach((pair) => {
      stats.get(pair.id).rests += 1;
    });

    rounds.push({
      round: roundIndex + 1,
      start_time: minutesToTime(roundStart),
      end_time: minutesToTime(roundStart + minutesPerMatch),
      matches,
      resting,
    });
  }

  const matches = rounds.flatMap((round) => round.matches);
  const pairStats = [...stats.values()]
    .map((stat) => ({
      id: stat.id,
      name: stat.name,
      category: stat.category,
      level: stat.level,
      matches: stat.matches,
      rests: stat.rests,
      rivals: stat.rivalsSet.size,
    }))
    .sort((left, right) => right.matches - left.matches || left.rests - right.rests || left.name.localeCompare(right.name));
  const matchCounts = pairStats.map((stat) => stat.matches);
  const repeatedMatchups = [...matchupCounts.values()].filter((count) => count > 1).length;

  return {
    rounds,
    matches,
    pairStats,
    warnings,
    restPerRound: Math.max(0, pairs.length - (courtsPerRound * 2)),
    timeWindow: rounds.length ? `${rounds[0].start_time}-${rounds[rounds.length - 1].end_time}` : "Sin horario",
    summary: `${matches.length} partidos · ${rounds.length} rondas · ${courtsPerRound} cancha${courtsPerRound === 1 ? "" : "s"}`,
    matchesPerPairRange: matchCounts.length ? `${Math.min(...matchCounts)}-${Math.max(...matchCounts)} por pareja` : "Sin parejas",
    repeatSummary: `${repeatedMatchups} repetido${repeatedMatchups === 1 ? "" : "s"}`,
  };
}

function matchCategoryPlans(pairs) {
  const groups = pairs
    .filter((pair) => pair.status === "completa" && pair.player_two_id)
    .reduce((acc, pair) => {
      acc[pair.category] = [...(acc[pair.category] || []), pair];
      return acc;
    }, {});

  return Object.entries(groups)
    .sort(([left], [right]) => String(left).localeCompare(String(right), undefined, { numeric: true }))
    .map(([category, categoryPairs]) => {
      const pairIds = categoryPairs.map((pair) => pair.id);
      const rounds = roundRobinMatches(pairIds);
      const totalMatches = (categoryPairs.length * Math.max(categoryPairs.length - 1, 0)) / 2;
      const courtsPerRound = rounds.length ? Math.max(...rounds.map((round) => round.length), 0) : 0;
      const levels = categoryPairs.map((pair) => Number(pair.skill_level || 5));
      return {
        category,
        pairs: categoryPairs,
        pairCount: categoryPairs.length,
        roundCount: rounds.length,
        totalMatches,
        courtsPerRound,
        minLevel: levels.length ? Math.min(...levels) : 0,
        maxLevel: levels.length ? Math.max(...levels) : 0,
      };
    });
}

function MatchPlanningOverview({ pairs, matches, fixtureForm, fixtureTiming, configuredCourts }) {
  const plans = matchCategoryPlans(pairs);
  const plannedMatches = matches.length;
  const completedMatches = matches.filter(matchHasResult).length;
  const totalRoundRobinMatches = plans.reduce((sum, plan) => sum + plan.totalMatches, 0);
  const requiredParallelCourts = plans.reduce((sum, plan) => sum + plan.courtsPerRound, 0);
  const availableTurns = Math.max(1, Math.floor(Number(fixtureTiming.rentalMinutes || 0) / Number(fixtureForm.set_minutes || 1)));
  const enoughCourts = !requiredParallelCourts || Number(configuredCourts || 0) >= requiredParallelCourts;

  return (
    <section className="match-planning-overview">
      <div className="match-planning-main">
        <div>
          <span>Programación</span>
          <strong>{plannedMatches ? `${plannedMatches} partidos guardados` : "Sin partidos guardados"}</strong>
          <p>{completedMatches}/{plannedMatches || totalRoundRobinMatches} resultados cargados</p>
        </div>
        <div>
          <span>Bloque</span>
          <strong>{fixtureTiming.valid ? fixtureTiming.fixtureStart : fixtureForm.start_time}</strong>
          <p>{availableTurns} turnos de {fixtureForm.set_minutes} min</p>
        </div>
        <div className={enoughCourts ? "ok" : "warning"}>
          <span>Canchas</span>
          <strong>{configuredCourts || 0}/{requiredParallelCourts || 0}</strong>
          <p>{enoughCourts ? "Capacidad simultánea suficiente" : "Faltan canchas simultáneas"}</p>
        </div>
      </div>

      <div className="match-category-plan-grid">
        {plans.length ? plans.map((plan) => (
          <article className="match-category-plan" key={plan.category}>
            <div>
              <strong>{plan.category}</strong>
              <span>{plan.pairCount} parejas</span>
            </div>
            <dl>
              <div>
                <dt>Cruces</dt>
                <dd>{plan.totalMatches}</dd>
              </div>
              <div>
                <dt>Rondas</dt>
                <dd>{plan.roundCount}</dd>
              </div>
              <div>
                <dt>Canchas</dt>
                <dd>{plan.courtsPerRound}</dd>
              </div>
              <div>
                <dt>Nivel</dt>
                <dd>N{plan.minLevel}-N{plan.maxLevel}</dd>
              </div>
            </dl>
          </article>
        )) : (
          <p className="empty">No hay parejas completas para programar.</p>
        )}
      </div>
    </section>
  );
}

function balancedBattleGrid(pairs, roundCount, courtCount) {
  const rounds = buildEmptyPlannerGrid(roundCount, courtCount);
  const usedMatchups = new Set();
  const allCandidates = [];

  pairs.forEach((one, index) => {
    pairs.slice(index + 1).forEach((two) => {
      allCandidates.push({
        one,
        two,
        key: matchupKey(one.id, two.id),
        diff: Math.abs(Number(one.skill_level || 5) - Number(two.skill_level || 5)),
      });
    });
  });

  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
    const usedThisRound = new Set();
    const rotatedCandidates = [...allCandidates].sort((left, right) => (
      Number(usedMatchups.has(left.key)) - Number(usedMatchups.has(right.key))
      || left.diff - right.diff
      || ((left.one.id + left.two.id + roundIndex) % 7) - ((right.one.id + right.two.id + roundIndex) % 7)
    ));

    for (let courtIndex = 0; courtIndex < courtCount; courtIndex += 1) {
      const candidate = rotatedCandidates.find((item) => (
        !usedThisRound.has(item.one.id)
        && !usedThisRound.has(item.two.id)
        && (!usedMatchups.has(item.key) || usedMatchups.size >= allCandidates.length)
      ));
      if (!candidate) break;
      rounds[roundIndex][courtIndex] = {
        pair_one_id: String(candidate.one.id),
        pair_two_id: String(candidate.two.id),
      };
      usedThisRound.add(candidate.one.id);
      usedThisRound.add(candidate.two.id);
      usedMatchups.add(candidate.key);
    }
  }

  return rounds;
}

function groupedRoundRobinPlannerGrid(pairs, assignments, labels, targetCourtCount) {
  const groupPlans = labels
    .map((label) => ({
      label,
      rounds: roundRobinMatches(
        pairs
          .filter((pair) => getPlannerGroup(assignments, pair.id) === label)
          .map((pair) => pair.id)
      ),
    }))
    .filter((plan) => plan.rounds.length);

  const requiredRounds = Math.max(1, ...groupPlans.map((plan) => plan.rounds.length));
  const rounds = Array.from({ length: requiredRounds }, () => []);

  groupPlans.forEach((plan) => {
    plan.rounds.forEach((groupRound, roundIndex) => {
      groupRound.forEach((slot) => rounds[roundIndex].push(slot));
    });
  });

  const requiredCourtCount = Math.max(1, Number(targetCourtCount || 0), ...rounds.map((round) => round.length));
  return {
    grid: rounds.map((round) => Array.from(
      { length: requiredCourtCount },
      (_, courtIndex) => round[courtIndex] || { pair_one_id: "", pair_two_id: "" }
    )),
    plannedCount: rounds.reduce((sum, round) => sum + round.length, 0),
    requiredCourtCount,
    requiredRounds,
  };
}

function parseCourtList(value) {
  const courts = String(value || "")
    .split(",")
    .map((court) => court.trim())
    .filter(Boolean);
  return courts.length ? courts : ["1"];
}

function plannerTimeSlot(roundIndex, setMinutes, startTime) {
  const start = minutesFromSlot(startTime || "10:30");
  const slotStart = (start === 9999 ? 630 : start) + (roundIndex * Number(setMinutes || 20));
  const slotEnd = slotStart + Number(setMinutes || 20);
  return `${String(Math.floor(slotStart / 60)).padStart(2, "0")}:${String(slotStart % 60).padStart(2, "0")}-${String(Math.floor(slotEnd / 60)).padStart(2, "0")}:${String(slotEnd % 60).padStart(2, "0")}`;
}

function plannerRows(grid, courts, category, setMinutes, startTime, groupAssignments = {}) {
  return grid.flatMap((round, roundIndex) => round.map((slot, courtIndex) => {
    const time = plannerTimeSlot(roundIndex, setMinutes, startTime);
    const groupName = plannerSlotGroup(slot, groupAssignments);
    const stageName = groupName || "Programacion manual";
    return {
      ...slot,
      court: courts[courtIndex] || String(courtIndex + 1),
      courtIndex,
      roundIndex,
      groupName,
      roundName: `${category || "Categoria"} - ${stageName} - Ronda ${roundIndex + 1} - ${time}`,
      time,
    };
  }));
}

function pairUsageInRound(round) {
  const usage = new Map();
  round.forEach((slot, courtIndex) => {
    for (const side of ["pair_one_id", "pair_two_id"]) {
      const pairId = slot[side];
      if (!pairId) continue;
      usage.set(String(pairId), [...(usage.get(String(pairId)) || []), { courtIndex, side }]);
    }
  });
  return usage;
}

function pairUsedElsewhereInRound(round, pairId, currentCourtIndex, currentSide) {
  if (!pairId) return false;
  const usage = pairUsageInRound(round).get(String(pairId)) || [];
  return usage.some((item) => item.courtIndex !== currentCourtIndex || item.side !== currentSide);
}

function slotHasImpossibleDuplicate(round, slot, courtIndex) {
  return Boolean(
    (slot.pair_one_id && slot.pair_one_id === slot.pair_two_id)
    || pairUsedElsewhereInRound(round, slot.pair_one_id, courtIndex, "pair_one_id")
    || pairUsedElsewhereInRound(round, slot.pair_two_id, courtIndex, "pair_two_id")
  );
}

function validatePlanner(grid, pairs, matches, options) {
  const rows = plannerRows(grid, options.courts, options.category, options.setMinutes, options.startTime, options.groupAssignments);
  const plannedRows = rows.filter((row) => row.pair_one_id || row.pair_two_id);
  const completeRows = rows.filter((row) => row.pair_one_id && row.pair_two_id && row.pair_one_id !== row.pair_two_id);
  const pairById = Object.fromEntries(pairs.map((pair) => [pair.id, pair]));
  const issues = [];
  const matchupCounts = new Map();
  const playedCounts = new Map();
  const roundPlayers = new Map();
  const roundDuplicateMessages = new Set();

  for (const row of plannedRows) {
    if (!row.pair_one_id || !row.pair_two_id) {
      issues.push(`Ronda ${row.roundIndex + 1}, cancha ${row.court}: falta una pareja.`);
      continue;
    }
    if (row.pair_one_id === row.pair_two_id) {
      issues.push(`Ronda ${row.roundIndex + 1}, cancha ${row.court}: una pareja no puede jugar contra si misma.`);
      continue;
    }
    const one = pairById[Number(row.pair_one_id)];
    const two = pairById[Number(row.pair_two_id)];
    if (options.category && (one?.category !== options.category || two?.category !== options.category)) {
      issues.push(`Ronda ${row.roundIndex + 1}, cancha ${row.court}: hay parejas fuera de ${options.category}.`);
    }
    const oneGroup = getPlannerGroup(options.groupAssignments || {}, row.pair_one_id);
    const twoGroup = getPlannerGroup(options.groupAssignments || {}, row.pair_two_id);
    if (oneGroup && twoGroup && oneGroup !== twoGroup) {
      issues.push(`Ronda ${row.roundIndex + 1}, cancha ${row.court}: cruza ${oneGroup} con ${twoGroup}.`);
    }
    const inRound = roundPlayers.get(row.roundIndex) || new Set();
    for (const pairId of [row.pair_one_id, row.pair_two_id]) {
      if (inRound.has(pairId)) {
        const label = pairName(pairById[Number(pairId)]);
        const message = `Ronda ${row.roundIndex + 1} (${row.time}): ${label} ya tiene partido en este turno. Una pareja no puede jugar en dos canchas a la misma hora.`;
        if (!roundDuplicateMessages.has(message)) {
          issues.push(message);
          roundDuplicateMessages.add(message);
        }
      }
      inRound.add(pairId);
      playedCounts.set(pairId, (playedCounts.get(pairId) || 0) + 1);
    }
    roundPlayers.set(row.roundIndex, inRound);
    const key = matchupKey(row.pair_one_id, row.pair_two_id);
    matchupCounts.set(key, (matchupCounts.get(key) || 0) + 1);
  }

  for (const [key, count] of matchupCounts.entries()) {
    if (count > 1) issues.push(`Cruce repetido en planner: ${key}.`);
  }

  {
    const existingKeys = new Set(
      matches
        .filter((match) => !options.replaceUnplayed || hasResult(match))
        .map((match) => matchupKey(match.pair_one_id, match.pair_two_id))
    );
    for (const row of completeRows) {
      if (existingKeys.has(matchupKey(row.pair_one_id, row.pair_two_id))) {
        issues.push(`Ya existe ${pairName(pairById[Number(row.pair_one_id)])} vs ${pairName(pairById[Number(row.pair_two_id)])}.`);
      }
    }
  }

  const activePairIds = pairs
    .filter((pair) => pair.status === "completa" && pair.player_two_id && (!options.category || pair.category === options.category))
    .map((pair) => String(pair.id));
  const allPossibleKeys = [];
  const assignments = options.groupAssignments || {};
  const groupedPairIds = activePairIds.reduce((acc, pairId) => {
    const groupName = getPlannerGroup(assignments, pairId) || "Sin grupo";
    acc[groupName] = [...(acc[groupName] || []), pairId];
    return acc;
  }, {});
  Object.values(groupedPairIds).forEach((groupPairIds) => {
    groupPairIds.forEach((oneId, index) => {
      groupPairIds.slice(index + 1).forEach((twoId) => allPossibleKeys.push(matchupKey(oneId, twoId)));
    });
  });
  const missingRoundRobin = allPossibleKeys.filter((key) => !matchupCounts.has(key));
  const balancedCounts = activePairIds.map((id) => playedCounts.get(id) || 0);
  const minGames = balancedCounts.length ? Math.min(...balancedCounts) : 0;
  const maxGames = balancedCounts.length ? Math.max(...balancedCounts) : 0;

  return {
    completeRows,
    issues,
    missingRoundRobin,
    minGames,
    maxGames,
    plannedCount: completeRows.length,
    totalRoundRobin: allPossibleKeys.length,
  };
}

function ManualFixturePlanner({ eventId, pairs, matches, fixtureForm, setFixtureForm, startTime, run }) {
  const categories = pairCategoryOptions(pairs);
  const pairById = useMemo(() => new Map(pairs.map((pair) => [String(pair.id), pair])), [pairs]);
  const [category, setCategory] = useState(fixtureForm.planner_category || "");
  const [roundCount, setRoundCount] = useState(Number(fixtureForm.planner_rounds || 5));
  const [courtInput, setCourtInput] = useState(fixtureForm.planner_courts || parseCourtList(fixtureForm.courts).slice(0, 3).join(", "));
  const [groupCount, setGroupCount] = useState(Number(fixtureForm.planner_group_count || 2));
  const [replaceUnplayed, setReplaceUnplayed] = useState(fixtureForm.planner_replace_unplayed ?? true);
  const [grid, setGrid] = useState(() => buildEmptyPlannerGrid(Number(fixtureForm.planner_rounds || 5), parseCourtList(fixtureForm.planner_courts || fixtureForm.courts).length || 3));
  const normalizedCourts = parseCourtList(courtInput);
  const courtCount = normalizedCourts.length;
  const activeCategory = category || categories[0] || "";
  const categoryPairs = pairs
    .filter((pair) => pair.status === "completa" && pair.player_two_id && (!activeCategory || pair.category === activeCategory))
    .sort((a, b) => (a.seed || 9999) - (b.seed || 9999) || a.id - b.id);
  const savedGroupAssignments = fixtureForm.planner_group_assignments?.[activeCategory] || {};
  const defaultGroupAssignments = useMemo(
    () => balancedGroupAssignments(categoryPairs, groupCount),
    [categoryPairs.map((pair) => `${pair.id}:${pair.skill_level || 5}:${pair.seed || ""}`).join("|"), groupCount]
  );
  const groupAssignments = {
    ...defaultGroupAssignments,
    ...Object.fromEntries(
      Object.entries(savedGroupAssignments).filter(([pairId]) => categoryPairs.some((pair) => String(pair.id) === String(pairId)))
    ),
  };
  const groupLabels = plannerGroupLabels(groupCount);
  const groupedFixturePreview = groupedRoundRobinPlannerGrid(categoryPairs, groupAssignments, groupLabels, 0);
  const activePlan = {
    pairs: categoryPairs.length,
    rounds: groupedFixturePreview.requiredRounds,
    matches: groupedFixturePreview.plannedCount,
    courts: groupedFixturePreview.requiredCourtCount,
  };
  const plannerStartTime = startTime || fixtureForm.start_time || "10:30";
  const validation = validatePlanner(grid, pairs, matches, {
    category: activeCategory,
    courts: normalizedCourts,
    replaceUnplayed,
    setMinutes: Number(fixtureForm.set_minutes || 20),
    startTime: plannerStartTime,
    groupAssignments,
  });

  useEffect(() => {
    if (!category && categories[0]) setCategory(categories[0]);
  }, [categories.join("|")]);

  useEffect(() => {
    const nextCourts = fixtureForm.planner_courts || parseCourtList(fixtureForm.courts).slice(0, 3).join(", ");
    const nextRounds = Number(fixtureForm.planner_rounds || 5);
    const nextGroupCount = Number(fixtureForm.planner_group_count || 2);
    setCategory(fixtureForm.planner_category || "");
    setRoundCount(nextRounds);
    setCourtInput(nextCourts);
    setGroupCount(nextGroupCount);
    setReplaceUnplayed(fixtureForm.planner_replace_unplayed ?? true);
    setGrid(buildEmptyPlannerGrid(nextRounds, parseCourtList(nextCourts).length || 1));
  }, [eventId]);

  function persistGroupAssignments(nextAssignments, nextGroupCount = groupCount) {
    setFixtureForm({
      ...fixtureForm,
      planner_group_count: nextGroupCount,
      planner_group_assignments: {
        ...(fixtureForm.planner_group_assignments || {}),
        [activeCategory]: nextAssignments,
      },
    });
  }

  function updateGroupCount(value) {
    const nextGroupCount = Math.max(1, Number(value) || 1);
    const labels = plannerGroupLabels(nextGroupCount);
    const nextAssignments = Object.fromEntries(
      categoryPairs.map((pair) => {
        const current = groupAssignments[String(pair.id)];
        return [String(pair.id), labels.includes(current) ? current : labels[0]];
      })
    );
    setGroupCount(nextGroupCount);
    persistGroupAssignments(nextAssignments, nextGroupCount);
  }

  function updatePairGroup(pairId, groupName) {
    persistGroupAssignments({
      ...groupAssignments,
      [String(pairId)]: groupName,
    });
  }

  function distributeGroups() {
    persistGroupAssignments(balancedGroupAssignments(categoryPairs, groupCount));
  }

  function ensureCourtListSize(courts, size) {
    const nextCourts = [...courts];
    for (let index = 1; nextCourts.length < size; index += 1) {
      const courtName = String(index);
      if (!nextCourts.includes(courtName)) nextCourts.push(courtName);
    }
    return nextCourts;
  }

  function resize(nextRounds, nextCourtCount = courtCount, persist = true) {
    const rounds = Math.max(1, Number(nextRounds) || 1);
    const courts = Math.max(1, Number(nextCourtCount) || 1);
    setRoundCount(rounds);
    if (persist) {
      setFixtureForm({
        ...fixtureForm,
        planner_rounds: rounds,
      });
    }
    setGrid((current) => Array.from({ length: rounds }, (_, roundIndex) =>
      Array.from({ length: courts }, (_, courtIndex) => current[roundIndex]?.[courtIndex] || { pair_one_id: "", pair_two_id: "" })
    ));
  }

  function updateCourts(value) {
    const nextCourts = parseCourtList(value);
    setCourtInput(value);
    setFixtureForm({
      ...fixtureForm,
      court_count: nextCourts.length,
      courts: nextCourts.join(", "),
      planner_courts: nextCourts.join(", "),
      planner_rounds: roundCount,
    });
    resize(roundCount, nextCourts.length, false);
  }

  function updateSlot(roundIndex, courtIndex, patch) {
    setGrid((current) => current.map((round, currentRound) => {
      if (currentRound !== roundIndex) return round;
      const changedSide = Object.prototype.hasOwnProperty.call(patch, "pair_one_id") ? "pair_one_id" : "pair_two_id";
      const oppositeSide = changedSide === "pair_one_id" ? "pair_two_id" : "pair_one_id";
      const selectedPairId = patch[changedSide] ? String(patch[changedSide]) : "";

      return round.map((slot, currentCourt) => {
        if (currentCourt === courtIndex) {
          const nextSlot = { ...slot, ...patch };
          if (selectedPairId && String(nextSlot[oppositeSide]) === selectedPairId) {
            nextSlot[oppositeSide] = "";
          }
          return nextSlot;
        }
        if (!selectedPairId) return slot;
        return {
          ...slot,
          pair_one_id: String(slot.pair_one_id) === selectedPairId ? "" : slot.pair_one_id,
          pair_two_id: String(slot.pair_two_id) === selectedPairId ? "" : slot.pair_two_id,
        };
      });
    }));
  }

  function dragPair(event, pairId) {
    event.dataTransfer.setData("text/plain", String(pairId));
    event.dataTransfer.effectAllowed = "copy";
  }

  function dropPair(event, roundIndex, courtIndex, side) {
    event.preventDefault();
    const pairId = event.dataTransfer.getData("text/plain");
    if (!pairId) return;
    updateSlot(roundIndex, courtIndex, { [side]: pairId });
  }

  function fillRoundRobin() {
    const pairIds = categoryPairs.map((pair) => pair.id);
    const matchesByRound = roundRobinMatches(pairIds);
    const nextRounds = Math.max(1, matchesByRound.length);
    const requiredCourtCount = Math.max(courtCount, ...matchesByRound.map((round) => round.length), 1);
    const nextCourts = [...normalizedCourts];
    for (let index = 1; nextCourts.length < requiredCourtCount; index += 1) {
      const courtName = String(index);
      if (!nextCourts.includes(courtName)) nextCourts.push(courtName);
    }
    setRoundCount(nextRounds);
    setCourtInput(nextCourts.join(", "));
    setFixtureForm({
      ...fixtureForm,
      court_count: requiredCourtCount,
      courts: nextCourts.join(", "),
      planner_courts: nextCourts.join(", "),
      planner_rounds: nextRounds,
    });
    setGrid(buildEmptyPlannerGrid(nextRounds, requiredCourtCount).map((round, roundIndex) =>
      round.map((slot, courtIndex) => matchesByRound[roundIndex]?.[courtIndex] || slot)
    ));
  }

  function fillBalancedBattles() {
    if (categoryPairs.length < 2) return;
    setGrid(balancedBattleGrid(categoryPairs, roundCount, courtCount));
  }

  function fillGroupedFixture() {
    const plan = groupedRoundRobinPlannerGrid(categoryPairs, groupAssignments, groupLabels, courtCount);
    if (!plan.plannedCount) return;
    const nextCourts = ensureCourtListSize(normalizedCourts, plan.requiredCourtCount);
    setRoundCount(plan.requiredRounds);
    setCourtInput(nextCourts.join(", "));
    setFixtureForm({
      ...fixtureForm,
      court_count: nextCourts.length,
      courts: nextCourts.join(", "),
      planner_courts: nextCourts.join(", "),
      planner_rounds: plan.requiredRounds,
      planner_group_count: groupCount,
      planner_group_assignments: {
        ...(fixtureForm.planner_group_assignments || {}),
        [activeCategory]: groupAssignments,
      },
    });
    setGrid(plan.grid.map((round) => Array.from(
      { length: nextCourts.length },
      (_, courtIndex) => round[courtIndex] || { pair_one_id: "", pair_two_id: "" }
    )));
  }

  function clearGrid() {
    setGrid(buildEmptyPlannerGrid(roundCount, courtCount));
  }

  async function savePlanner() {
    await run(async () => {
      const payload = validation.completeRows.map((row) => ({
        pair_one_id: Number(row.pair_one_id),
        pair_two_id: Number(row.pair_two_id),
        round_name: row.roundName,
        court: row.court,
      }));
      await api.createMatchesBulk(eventId, payload, replaceUnplayed, activeCategory);
    });
  }

  const canSave = eventId && validation.plannedCount > 0 && validation.issues.length === 0;
  const canBuildGroupedFixture = categoryPairs.length >= 2 && groupLabels.some((label) =>
    categoryPairs.filter((pair) => getPlannerGroup(groupAssignments, pair.id) === label).length >= 2
  );

  return (
    <details className="manual-planner" open={!matches.length}>
      <summary>Planner manual por rondas y canchas</summary>
      <div className="manual-planner-body">
        <div className="planner-command">
          <div>
            <span>Categoría activa</span>
            <strong>{activeCategory || "Sin categoría"}</strong>
            <p>{activePlan.pairs} parejas · {activePlan.matches} cruces · {activePlan.rounds} rondas</p>
          </div>
          <div>
            <span>Uso recomendado</span>
            <strong>{activePlan.courts || 0} cancha{activePlan.courts === 1 ? "" : "s"}</strong>
            <p>{activePlan.rounds || 0} turno{activePlan.rounds === 1 ? "" : "s"} para todos contra todos</p>
          </div>
          <div className={validation.issues.length ? "warning" : "ok"}>
            <span>Estado propuesta</span>
            <strong>{validation.issues.length ? `${validation.issues.length} alerta(s)` : "Sin conflictos"}</strong>
            <p>{validation.plannedCount}/{validation.totalRoundRobin} cruces listos</p>
          </div>
        </div>

        <div className="planner-toolbar">
          <label>
            Categoría
            <select
              value={activeCategory}
              onChange={(event) => {
                setCategory(event.target.value);
                setFixtureForm({ ...fixtureForm, planner_category: event.target.value });
              }}
            >
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Rondas
            <input type="number" min="1" value={roundCount} onChange={(event) => resize(event.target.value, courtCount)} />
          </label>
          <label>
            Inicio
            <input value={plannerStartTime} readOnly />
          </label>
          <label className="planner-courts-field">
            Canchas
            <input placeholder="1, 3, 5" value={courtInput} onChange={(event) => updateCourts(event.target.value)} />
          </label>
          <label>
            Minutos
            <input
              type="number"
              min="1"
              value={fixtureForm.set_minutes}
              onChange={(event) => setFixtureForm({ ...fixtureForm, set_minutes: event.target.value })}
            />
          </label>
          <label className="planner-check">
            <input
              type="checkbox"
              checked={replaceUnplayed}
              onChange={(event) => {
                setReplaceUnplayed(event.target.checked);
                setFixtureForm({ ...fixtureForm, planner_replace_unplayed: event.target.checked });
              }}
            />
            <span>Reemplazar esta categoría</span>
          </label>
          <button type="button" className="secondary-action" onClick={clearGrid}>
            Limpiar
          </button>
          <button type="button" onClick={savePlanner} disabled={!canSave}>
            <Save size={16} /> Guardar {validation.plannedCount || ""}
          </button>
        </div>

        <section className="planner-group-board" aria-label="Configuración de grupos">
          <div className="planner-group-toolbar">
            <div>
              <span>Grupos del planner</span>
              <strong>{groupLabels.length} grupo{groupLabels.length === 1 ? "" : "s"} para {activeCategory || "la categoría"}</strong>
            </div>
            <label>
              Cantidad
              <input type="number" min="1" max="8" value={groupCount} onChange={(event) => updateGroupCount(event.target.value)} />
            </label>
            <button type="button" className="secondary-action" onClick={distributeGroups} disabled={categoryPairs.length < 2}>
              Distribuir grupos
            </button>
            <button type="button" onClick={fillGroupedFixture} disabled={!canBuildGroupedFixture}>
              <Swords size={16} /> Armar fixture
            </button>
          </div>
          <div className="planner-group-grid">
            {categoryPairs.length ? categoryPairs.map((pair) => (
              <label className="planner-group-card" key={`group-${pair.id}`}>
                <span>
                  <PairLevelBadge level={pair.skill_level} compact />
                  <b>{pairName(pair)}</b>
                </span>
                <select value={groupAssignments[String(pair.id)] || groupLabels[0]} onChange={(event) => updatePairGroup(pair.id, event.target.value)}>
                  {groupLabels.map((label) => <option key={`${pair.id}-${label}`} value={label}>{label}</option>)}
                </select>
              </label>
            )) : (
              <p className="empty">No hay parejas completas para agrupar.</p>
            )}
          </div>
        </section>

        <div className="planner-validation">
          <span className={validation.issues.length ? "warning" : "ok"}>
            {validation.issues.length ? `${validation.issues.length} alerta(s)` : "Sin conflictos"}
          </span>
          <span className={validation.missingRoundRobin.length ? "warning" : "ok"}>
            {validation.plannedCount}/{validation.totalRoundRobin} cruces todos contra todos
          </span>
          <span className={validation.minGames === validation.maxGames ? "ok" : "warning"}>
            {validation.minGames}-{validation.maxGames} partidos por pareja
          </span>
        </div>

        <div className="planner-pair-tray" aria-label="Parejas disponibles">
          {categoryPairs.length ? categoryPairs.map((pair) => (
            <button
              type="button"
              className="planner-pair-chip"
              draggable
              onDragStart={(event) => dragPair(event, pair.id)}
              key={`tray-${pair.id}`}
              title="Arrastra a una cancha"
            >
              <PairLevelBadge level={pair.skill_level} compact />
              <span>{pairName(pair)}</span>
            </button>
          )) : (
            <span className="empty">No hay parejas completas en esta categoría.</span>
          )}
        </div>

        {validation.issues.length > 0 && (
          <div className="planner-issues">
            {validation.issues.slice(0, 6).map((issue) => <p key={issue}>{issue}</p>)}
            {validation.issues.length > 6 && <p>{validation.issues.length - 6} alertas mas.</p>}
          </div>
        )}

        <div className="manual-planner-grid-wrap">
          <div className="manual-planner-grid" style={{ "--planner-courts": courtCount }}>
            <div className="planner-row planner-head">
              <span>Ronda</span>
              {normalizedCourts.map((court, index) => <span key={`${court}-${index}`}>{normalizeCourt(court)}</span>)}
            </div>
            {grid.map((round, roundIndex) => (
              <div className="planner-row" key={`round-${roundIndex}`}>
                <div className="planner-round-cell">
                  <strong>R{roundIndex + 1}</strong>
                  <span>{plannerTimeSlot(roundIndex, fixtureForm.set_minutes, plannerStartTime)}</span>
                </div>
                {round.map((slot, courtIndex) => {
                  const hasImpossibleDuplicate = slotHasImpossibleDuplicate(round, slot, courtIndex);
                  return (
                  <div className={`planner-slot ${hasImpossibleDuplicate ? "impossible" : ""}`} key={`slot-${roundIndex}-${courtIndex}`}>
                    <div
                      className="planner-drop-zone"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => dropPair(event, roundIndex, courtIndex, "pair_one_id")}
                    >
                    <select value={slot.pair_one_id} onChange={(event) => updateSlot(roundIndex, courtIndex, { pair_one_id: event.target.value })}>
                      <option value="">Pareja 1</option>
                      {categoryPairs.map((pair) => (
                        <option
                          key={pair.id}
                          value={pair.id}
                          disabled={pairUsedElsewhereInRound(round, pair.id, courtIndex, "pair_one_id")}
                        >
                          {pairName(pair)} · {pairLevelLabel(pair.skill_level)}
                        </option>
                      ))}
                    </select>
                    </div>
                    <div
                      className="planner-drop-zone"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => dropPair(event, roundIndex, courtIndex, "pair_two_id")}
                    >
                    <select value={slot.pair_two_id} onChange={(event) => updateSlot(roundIndex, courtIndex, { pair_two_id: event.target.value })}>
                      <option value="">Pareja 2</option>
                      {categoryPairs.map((pair) => (
                        <option
                          key={pair.id}
                          value={pair.id}
                          disabled={pairUsedElsewhereInRound(round, pair.id, courtIndex, "pair_two_id")}
                        >
                          {pairName(pair)} · {pairLevelLabel(pair.skill_level)}
                        </option>
                      ))}
                    </select>
                    </div>
                    <PlannerLevelChips pairOne={pairById.get(slot.pair_one_id)} pairTwo={pairById.get(slot.pair_two_id)} />
                  </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}

function DynamicFourPairFinals({ matches, pairs, standings, eventId, fixtureForm, onChange }) {
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
  const plans = computeFinalPlans({ pairs, matches, standings, fixtureConfig: fixtureForm });

  if (!plans.length) return null;

  function createMatches(payload) {
    return onChange(() => api.createMatchesBulk(eventId, payload, false));
  }

  return (
    <article className="data-block dynamic-plan">
      <div className="block-head">
        <h3>Fase final automática</h3>
        <span>Ronda 4 y 5 por ranking</span>
      </div>
      {plans.map((plan) => {
        const missingSemis = plan.semis || [];
        const missingFinals = plan.finals;
        const placementMatches = plan.placementMatches || [];
        const canCreateSemis = eventId && plan.allGroupResults && missingSemis.length > 0;
        const canCreateFinals = eventId && plan.existingSemiOne && plan.existingSemiTwo && hasResult(plan.existingSemiOne) && hasResult(plan.existingSemiTwo) && missingFinals.length > 0;
        const canCreatePlacements = eventId && plan.allGroupResults && placementMatches.length > 0;
        return (
          <section className="dynamic-category-plan" key={plan.category}>
            <div className="fixture-turn-title">
              <strong>{plan.category}</strong>
              <span>{plan.allGroupResults ? "ranking listo" : `${plan.finishedGroupMatches}/${plan.totalGroupMatches} resultados fase`}</span>
            </div>
            {plan.type === "placements" ? (
              <>
                <div className="qualifier-grid">
                  {plan.groupPlans.map((group) => (
                    <div className="qualifier-card" key={group.groupName}>
                      <span>{group.groupName}</span>
                      <strong>{group.finishedMatches}/{group.totalMatches} resultados</strong>
                      <ol>
                        {group.standings.map((standing, index) => (
                          <li key={standing.pair.id}>
                            {index + 1}. {pairName(standing.pair)} <b>{standing.points}</b>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                  <div className="dynamic-court-card">
                    <span>Ronda 4 · {plan.placementTime}</span>
                    <strong>Finales por posición</strong>
                    {(placementMatches.length ? placementMatches : [
                      { round_name: "Final", pair_one_id: null, pair_two_id: null },
                      { round_name: "3er lugar", pair_one_id: null, pair_two_id: null },
                      { round_name: "5to lugar", pair_one_id: null, pair_two_id: null },
                      { round_name: "7mo lugar", pair_one_id: null, pair_two_id: null },
                    ]).map((match, index) => (
                      <p key={`${plan.category}-placement-${index}`}>
                        {match.pair_one_id && match.pair_two_id
                          ? `${pairName(pairById.get(match.pair_one_id))} vs ${pairName(pairById.get(match.pair_two_id))}`
                          : match.round_name}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="dynamic-actions">
                  <button type="button" className="secondary-action" disabled={!canCreatePlacements} onClick={() => createMatches(placementMatches)}>
                    Crear ronda 4 posiciones
                  </button>
                </div>
              </>
            ) : (
            <>
              <div className="qualifier-grid">
              <div className="qualifier-card">
                <span>Tabla tras ronda 3</span>
                <strong>{plan.allGroupResults ? "Definida" : "Pendiente"}</strong>
                <small>Ordena por puntos, ganados, diferencia, juegos a favor y seed.</small>
                <ol>
                  {plan.standingsRows.map((standing, index) => (
                    <li key={standing.pair_id || standing.pair.id}>
                      {index + 1}. {pairName(standing.pair || pairById.get(standing.pair_id))} <b>{standing.points}</b>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="dynamic-court-card">
                <span>Ronda 4 · {plan.semiTime}</span>
                <strong>Semifinales</strong>
                <p>{plan.semis[0] ? `${pairName(pairById.get(plan.semis[0].pair_one_id))} vs ${pairName(pairById.get(plan.semis[0].pair_two_id))}` : "1 vs 4"}</p>
                <p>{plan.semis[1] ? `${pairName(pairById.get(plan.semis[1].pair_one_id))} vs ${pairName(pairById.get(plan.semis[1].pair_two_id))}` : "2 vs 3"}</p>
              </div>
              <div className="dynamic-court-card">
                <span>Ronda 5 · {plan.finalTime}</span>
                <strong>Final y 3er lugar</strong>
                <p>{plan.finals[0] ? `${pairName(pairById.get(plan.finals[0].pair_one_id))} vs ${pairName(pairById.get(plan.finals[0].pair_two_id))}` : "Ganadores a la final"}</p>
                <p>{plan.finals[1] ? `${pairName(pairById.get(plan.finals[1].pair_one_id))} vs ${pairName(pairById.get(plan.finals[1].pair_two_id))}` : "Perdedores por 3er lugar"}</p>
              </div>
            </div>
            <div className="dynamic-actions">
              <button type="button" className="secondary-action" disabled={!canCreateSemis} onClick={() => createMatches(missingSemis)}>
                Crear ronda 4
              </button>
              <button type="button" className="secondary-action" disabled={!canCreateFinals} onClick={() => createMatches(missingFinals)}>
                Crear ronda 5
              </button>
            </div>
            </>
            )}
          </section>
        );
      })}
      <p className="muted">Desempate actual: puntos, partidos ganados, diferencia, juegos a favor y seed de inscripción.</p>
    </article>
  );
}

function FixturePreview({ matches, pairs, configuredCourts, resultForm, setResultForm, eventId, onChange, rentalMinutes, startTime }) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [turnFilter, setTurnFilter] = useState("all");

  const scheduledRows = scheduledMatchRows(matches, pairs);

  const categories = [...new Set(scheduledRows.map((row) => row.category))];
  const turns = [...new Set(scheduledRows.map((row) => row.turn))];
  const timeSlots = [...new Set(scheduledRows.map((row) => row.time || row.turn))];
  const courtNames = [...new Set(scheduledRows.map((row) => row.court).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  const visibleRows = scheduledRows.filter((row) =>
    (categoryFilter === "all" || row.category === categoryFilter)
    && (turnFilter === "all" || row.turn === turnFilter),
  );
  const completedCount = scheduledRows.filter((row) => row.done).length;
  const nextTime = [...new Set(scheduledRows.filter((row) => !row.done).map((row) => row.time || row.turn))]
    .sort((a, b) => minutesFromSlot(a) - minutesFromSlot(b))[0];
  const nextRows = nextTime
    ? scheduledRows
      .filter((row) => (row.time || row.turn) === nextTime)
      .sort((a, b) => String(a.court).localeCompare(String(b.court), undefined, { numeric: true }))
    : scheduledRows.slice(0, Math.min(8, scheduledRows.length));
  const courtTimeCounts = scheduledRows.reduce((counts, row) => {
    const key = `${row.court || "sin-cancha"}-${row.time || row.turn}`;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const collisionRows = scheduledRows.filter((row) => courtTimeCounts[`${row.court || "sin-cancha"}-${row.time || row.turn}`] > 1);
  const visibleTimeSlots = [...new Set(visibleRows.map((row) => row.time || row.turn))]
    .sort((a, b) => minutesFromSlot(a) - minutesFromSlot(b));
  const rowByCourtTime = visibleRows.reduce((map, row) => {
    map[`${row.time || row.turn}-${row.court}`] = row;
    return map;
  }, {});
  const startMinutes = startTime ? minutesFromSlot(startTime) : minutesFromSlot(timeSlots[0]);
  const finishMinutes = Math.max(...scheduledRows.map((row) => slotEndMinutes(row.time || row.turn)), 0);
  const outsideRental = rentalMinutes && finishMinutes > startMinutes + rentalMinutes;
  const uncourtedCount = scheduledRows.filter((row) => !row.court).length;
  const validationItems = [
    { ok: collisionRows.length === 0, text: collisionRows.length === 0 ? "Sin choques de cancha" : `${collisionRows.length} choques de cancha` },
    { ok: uncourtedCount === 0, text: uncourtedCount === 0 ? "Todos los partidos tienen cancha" : `${uncourtedCount} partidos sin cancha` },
    { ok: !outsideRental, text: outsideRental ? "Se pasa del arriendo" : "Dentro del arriendo" },
    { ok: completedCount === scheduledRows.length, text: completedCount === scheduledRows.length ? "Resultados completos" : `${scheduledRows.length - completedCount} resultados pendientes` },
  ];

  return (
    <div className="fixture-preview">
      <div className="block-head">
        <h3>Programación de canchas</h3>
        <span>{matches.length} partidos</span>
      </div>
      {scheduledRows.length ? (
        <>
          <div className="fixture-overview">
            <div>
              <strong>{timeSlots.length}</strong>
              <span>horarios</span>
            </div>
            <div>
              <strong>{courtNames.length || 1}</strong>
              <span>canchas</span>
            </div>
            <div>
              <strong>{categories.length}</strong>
              <span>categorías</span>
            </div>
            <div>
              <strong>{completedCount}/{scheduledRows.length}</strong>
              <span>resultados</span>
            </div>
          </div>

          <div className="fixture-validation">
            {validationItems.map((item) => (
              <span className={item.ok ? "ok" : "warning"} key={item.text}>{item.text}</span>
            ))}
          </div>

          {collisionRows.length > 0 && (
            <div className="fixture-collision-alert">
              <strong>Choque de cancha detectado</strong>
              <span>Hay {collisionRows.length} partidos compartiendo cancha y horario. Regenera el fixture antes de jugar.</span>
            </div>
          )}

          <div className="fixture-focus">
            <div>
              <span>Próximo horario</span>
              <strong>{nextTime || "Sin partidos pendientes"}</strong>
              <small>{nextRows.length} cancha{nextRows.length === 1 ? "" : "s"} en uso</small>
            </div>
            <div className="fixture-focus-list">
              {nextRows.map((row) => (
                <p key={`next-${row.match.id}`}>
                  <b>{row.courtLabel}</b> {row.category}: {row.pairOne} vs {row.pairTwo}
                </p>
              ))}
            </div>
          </div>

          <div className="fixture-filters">
            <label>
              Categoría
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">Todas</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label>
              Turno
              <select value={turnFilter} onChange={(event) => setTurnFilter(event.target.value)}>
                <option value="all">Todos</option>
                {turns.map((turn) => <option key={turn} value={turn}>{turn}</option>)}
              </select>
            </label>
          </div>

          <div className="court-matrix-wrap">
            <div className="court-matrix" style={{ "--court-count": Math.max(courtNames.length, 1) }}>
              <div className="court-matrix-row court-matrix-head">
                <span>Horario</span>
                {courtNames.map((court) => (
                  <span key={`head-${court}`}>{normalizeCourt(court)}</span>
                ))}
              </div>
              {visibleTimeSlots.map((time) => (
                <div className="court-matrix-row" key={time}>
                  <div className="court-time-cell">
                    <strong>{time}</strong>
                    <span>
                      {visibleRows.filter((row) => (row.time || row.turn) === time).length}
                      {" "}en juego
                    </span>
                  </div>
                  {courtNames.map((court) => {
                    const row = rowByCourtTime[`${time}-${court}`];
                    if (!row) {
                      return (
                        <div className="court-cell empty" key={`${time}-${court}`}>
                          <span>Libre</span>
                        </div>
                      );
                    }
                    const current = resultForm?.[row.match.id] || {
                      pair_one_score: row.match.pair_one_score ?? "",
                      pair_two_score: row.match.pair_two_score ?? "",
                    };
                    return (
                      <article className={`court-cell ${row.done ? "done" : ""}`} key={`${time}-${court}-${row.match.id}`}>
                        <div className="court-cell-meta">
                          <b>{row.category}</b>
                          <span>{row.group || row.turn}</span>
                        </div>
                        <div className="court-cell-pairs">
                          <p>{row.pairOne}</p>
                          <em>vs</em>
                          <p>{row.pairTwo}</p>
                        </div>
                        <div className="quick-score">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={current.pair_one_score}
                            onChange={(e) => setResultForm({
                              ...resultForm,
                              [row.match.id]: { ...current, pair_one_score: e.target.value },
                            })}
                          />
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={current.pair_two_score}
                            onChange={(e) => setResultForm({
                              ...resultForm,
                              [row.match.id]: { ...current, pair_two_score: e.target.value },
                            })}
                          />
                          <button
                            type="button"
                            aria-label="Guardar resultado"
                            title="Guardar resultado"
                            disabled={!eventId || current.pair_one_score === "" || current.pair_two_score === ""}
                            onClick={() => onChange(() => api.registerResult(eventId, row.match.id, {
                              pair_one_score: Number(current.pair_one_score),
                              pair_two_score: Number(current.pair_two_score),
                            }))}
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <details className="fixture-details">
            <summary>Ver listado completo</summary>
            <div className="fixture-table">
              <div className="fixture-table-row fixture-table-head">
                <span>Turno</span>
                <span>Cancha</span>
                <span>Categoría</span>
                <span>Partido</span>
              </div>
              {visibleRows.map((row) => (
                <div className="fixture-table-row" key={row.match.id}>
                  <span>{row.turn}</span>
                  <span>{row.courtLabel}</span>
                  <span>{row.category}</span>
                  <span>{row.pairOne} vs {row.pairTwo}</span>
                </div>
              ))}
            </div>
          </details>
        </>
      ) : (
        <p className="empty">Genera el fixture para ver las rondas por categoría y cancha.</p>
      )}
    </div>
  );
}

function TournamentBracket({ matches, pairs }) {
  const bracketRows = matches
    .filter((match) => (match.round_name || "").includes(" - Torneo - "))
    .map((match) => {
      const [category, , stage] = match.round_name.split(" - ");
      const one = pairs.find((pair) => pair.id === match.pair_one_id);
      const two = pairs.find((pair) => pair.id === match.pair_two_id);
      const winnerId = match.winner_pair_id;
      return {
        category,
        stage,
        match,
        pairOne: one ? pairName(one) : `Pareja ${match.pair_one_id}`,
        pairTwo: two ? pairName(two) : `Pareja ${match.pair_two_id}`,
        winner: winnerId === match.pair_one_id ? (one ? pairName(one) : `Pareja ${match.pair_one_id}`) :
          winnerId === match.pair_two_id ? (two ? pairName(two) : `Pareja ${match.pair_two_id}`) : "",
      };
    });

  const bracketByCategory = bracketRows.reduce((groups, row) => {
    groups[row.category] = [...(groups[row.category] || []), row];
    return groups;
  }, {});

  if (!bracketRows.length) return null;

  return (
    <div className="tournament-map">
      <div className="block-head">
        <h3>Mapa torneo</h3>
        <span>{bracketRows.length} partidos</span>
      </div>
      {Object.entries(bracketByCategory).map(([category, rows]) => (
        <section className="tournament-category" key={category}>
          <div className="fixture-turn-title">
            <strong>{category}</strong>
            <span>{rows.length} cruces</span>
          </div>
          <div className="tournament-rounds">
            {["Semifinal 1", "Semifinal 2", "Final", "Tercer lugar"].map((stage) => {
              const row = rows.find((item) => item.stage === stage);
              return (
                <article className={`tournament-match ${row ? "" : "pending"}`} key={`${category}-${stage}`}>
                  <strong>{stage}</strong>
                  {row ? (
                    <>
                      <p>{row.pairOne}</p>
                      <em>vs</em>
                      <p>{row.pairTwo}</p>
                      {row.winner && <span>Gana: {row.winner}</span>}
                    </>
                  ) : (
                    <small>Pendiente de resultados</small>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function FixtureCategorySheet({ category, rounds, pairs, configuredCourtNames }) {
  const matches = Object.values(rounds).flat();
  const categoryCourts = [...new Set(matches.map((match) => match.court).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true }),
  );
  const missingCourtMatches = matches.filter((match) => !match.court).length;
  const courtNames = categoryCourts.length ? categoryCourts : configuredCourtNames;

  return (
    <article className="fixture-category">
      <div className="fixture-category-title">
        <strong>{category}</strong>
        {missingCourtMatches > 0 && <span>{missingCourtMatches} sin cancha</span>}
      </div>
      <div className="fixture-sheet" style={{ "--court-count": Math.max(courtNames.length, 1) }}>
        <div className="sheet-cell sheet-head">Ronda</div>
        {(courtNames.length ? courtNames : ["-"]).map((court) => (
          <div className="sheet-cell sheet-head" key={`${category}-head-${court}`}>Cancha {court}</div>
        ))}
        {Object.entries(rounds).map(([round, roundMatches]) => (
          <React.Fragment key={`${category}-${round}`}>
            <div className="sheet-cell sheet-round">{round}</div>
            {(courtNames.length ? courtNames : ["-"]).map((court) => {
              const match = roundMatches.find((item) => (item.court || "-") === court);
              const one = match ? pairs.find((pair) => pair.id === match.pair_one_id) : null;
              const two = match ? pairs.find((pair) => pair.id === match.pair_two_id) : null;
              return (
                <div className="sheet-cell sheet-match" key={`${category}-${round}-${court}`}>
                  {match ? (
                    <>
                      <span>{one ? pairName(one) : `Pareja ${match.pair_one_id}`}</span>
                      <b>vs</b>
                      <span>{two ? pairName(two) : `Pareja ${match.pair_two_id}`}</span>
                    </>
                  ) : (
                    <em>Libre</em>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      {missingCourtMatches > 0 && (
        <div className="uncourted-list">
          {matches.filter((match) => !match.court).map((match) => {
            const one = pairs.find((pair) => pair.id === match.pair_one_id);
            const two = pairs.find((pair) => pair.id === match.pair_two_id);
            return (
              <p key={match.id}>Sin cancha: {one ? pairName(one) : match.pair_one_id} vs {two ? pairName(two) : match.pair_two_id}</p>
            );
          })}
        </div>
      )}
    </article>
  );
}

function MatchList({ matches, pairs, resultForm, setResultForm, eventId, onChange }) {
  const roundNames = [...new Set(matches.map((match) => match.round_name || "Grupo"))];
  const [selectedRound, setSelectedRound] = useState("");
  const activeRound = selectedRound || roundNames[0] || "";
  const visibleMatches = activeRound ? matches.filter((match) => (match.round_name || "Grupo") === activeRound) : matches;

  return (
    <div>
      <div className="block-head">
        <h3>Resultados</h3>
        <select className="round-select" value={activeRound} onChange={(e) => setSelectedRound(e.target.value)}>
          {roundNames.length ? (
            roundNames.map((roundName, index) => (
              <option key={roundName} value={roundName}>Partido {index + 1}</option>
            ))
          ) : (
            <option value="">Sin partidos</option>
          )}
        </select>
      </div>
      <div className="match-list">
        {visibleMatches.map((match) => {
          const one = pairs.find((pair) => pair.id === match.pair_one_id);
          const two = pairs.find((pair) => pair.id === match.pair_two_id);
          const current = resultForm[match.id] || { pair_one_score: "", pair_two_score: "" };
          return (
            <article className="match-row" key={match.id}>
              <span>{one ? pairName(one) : match.pair_one_id} vs {two ? pairName(two) : match.pair_two_id}</span>
              <input
                type="number"
                value={current.pair_one_score}
                onChange={(e) => setResultForm({ ...resultForm, [match.id]: { ...current, pair_one_score: e.target.value } })}
              />
              <input
                type="number"
                value={current.pair_two_score}
                onChange={(e) => setResultForm({ ...resultForm, [match.id]: { ...current, pair_two_score: e.target.value } })}
              />
              <button
                onClick={() => onChange(() => api.registerResult(eventId, match.id, {
                  pair_one_score: Number(current.pair_one_score),
                  pair_two_score: Number(current.pair_two_score),
                }))}
              >
                Guardar
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
