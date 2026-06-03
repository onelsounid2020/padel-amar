import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarPlus,
  Clipboard,
  CreditCard,
  ExternalLink,
  FileCheck2,
  Check,
  ListChecks,
  Medal,
  RefreshCw,
  Swords,
  UserPlus,
  Users,
} from "lucide-react";
import { api, setAuthToken } from "./api/client";
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
  description: "",
  is_active: true,
};

const emptyPlayer = { name: "", phone: "", category: "", preferred_side: "indiferente" };
const emptyPublicRegistration = {
  name: "",
  email: "",
  phone: "",
  paid: false,
  gender: "hombre",
  category: "1era",
  preferred_side: "indiferente",
  partner_name: "",
  partner_email: "",
  partner_phone: "",
  partner_member_id: "",
  partner_paid: false,
  partner_preferred_side: "indiferente",
};
const emptyPublicResult = { round_name: "", match_id: "", pair_one_score: "", pair_two_score: "" };

const modalityOptions = [
  { value: "five_consecutive", label: "5 partidos seguidos" },
  { value: "group_ranking_best", label: "Ranking por grupos, clasifica el mejor" },
  { value: "round_robin_groups", label: "Todos contra todos por grupos" },
  { value: "ranking_only", label: "Solo ranking" },
];

const defaultCategoryConfig = {
  category: "",
  modality: "five_consecutive",
  group_size: 4,
  guaranteed_matches: 5,
  qualifiers_per_group: 1,
  notes: "",
};

const amarTodayCategoryConfigs = [
  {
    category: "5ta",
    modality: "five_consecutive",
    group_size: 6,
    guaranteed_matches: 5,
    qualifiers_per_group: 0,
    notes: "5 partidos seguidos por grupo.",
  },
  {
    category: "4ta",
    modality: "group_ranking_best",
    group_size: 4,
    guaranteed_matches: 3,
    qualifiers_per_group: 1,
    notes: "3 partidos de ranking. Pasa el mejor de cada grupo.",
  },
];

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
  mujer: ["5taD+", "4taC+", "3raB+", "2daA+"],
};

function categoryLabel(category) {
  return category;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || "").trim());
}

function pairName(pair) {
  const second = pair.player_two ? pair.player_two.name : "busca partner";
  return `${pair.player_one.name} / ${second}`;
}

function mergePlayersFromPairs(players, pairs) {
  const byId = new Map(players.map((player) => [player.id, player]));
  pairs.forEach((pair) => {
    if (pair.player_one && !byId.has(pair.player_one.id)) byId.set(pair.player_one.id, pair.player_one);
    if (pair.player_two && !byId.has(pair.player_two.id)) byId.set(pair.player_two.id, pair.player_two);
  });
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function pageFromLocation() {
  if (typeof window === "undefined") return "events";
  const view = new URLSearchParams(window.location.search).get("view");
  const path = window.location.pathname;
  if (path === "/tablet" || view === "tablet") return "tablet";
  if (path === "/usuarios" || view === "users") return "users";
  if (path === "/perfiles" || view === "profiles") return "profiles";
  if (path === "/crear-cuenta" || view === "signup") return "signup";
  if (path === "/registro" || view === "register") return "register";
  if (path === "/resultados" || view === "results") return "results";
  return "events";
}

function App() {
  const [dashboard, setDashboard] = useState([]);
  const [events, setEvents] = useState([]);
  const [players, setPlayers] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [users, setUsers] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventForm, setEventForm] = useState(emptyEvent);
  const [playerForm, setPlayerForm] = useState(emptyPlayer);
  const [pairForm, setPairForm] = useState({ player_one_id: "", player_two_id: "", category: "", status: "buscando_partner" });
  const [matchForm, setMatchForm] = useState({ pair_one_id: "", pair_two_id: "", round_name: "Grupo", court: "" });
  const [fixtureForm, setFixtureForm] = useState({
    mode: "groups",
    group_size: 4,
    guaranteed_matches: 5,
    court_count: 11,
    courts: "1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11",
    rental_minutes: 120,
    set_minutes: 20,
    start_time: "17:00",
  });
  const [resultForm, setResultForm] = useState({});
  const [publicForm, setPublicForm] = useState(emptyPublicRegistration);
  const [publicResultForm, setPublicResultForm] = useState(emptyPublicResult);
  const [registrationSuccess, setRegistrationSuccess] = useState(null);
  const [whatsapp, setWhatsapp] = useState("");
  const [authUser, setAuthUser] = useState(null);
  const [currentPermissions, setCurrentPermissions] = useState(publicPermissions);
  const [permissionModules, setPermissionModules] = useState(fallbackPermissionModules);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [signupForm, setSignupForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    category: "5ta",
    preferred_side: "indiferente",
  });
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", role: "jugador" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(pageFromLocation);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === Number(selectedEventId)),
    [events, selectedEventId],
  );

  function navigatePage(nextPage) {
    const paths = {
      events: "/",
      register: "/registro",
      results: "/resultados",
      tablet: "/tablet",
      users: "/usuarios",
      profiles: "/perfiles",
      signup: "/crear-cuenta",
    };
    setPage(nextPage);
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", paths[nextPage] || "/");
    }
  }

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
    if (!selectedEventId && eventsData[0]) setSelectedEventId(String(eventsData[0].id));
  }

  async function loadEventData(eventId = selectedEventId, userOverride = authUser, permissionOverride = currentPermissions) {
    if (!eventId) return;
    const effectiveUser = userOverride;
    const effectivePermissions = effectiveUser?.role === "superadmin"
      ? Object.fromEntries(fallbackPermissionModules.map((module) => [module.key, true]))
      : permissionOverride;
    const [pairData, paymentData, matchData, standingData, rankingData, whatsappData] = await Promise.all([
      api.pairs(eventId),
      effectiveUser && effectivePermissions.events ? api.payments(eventId) : Promise.resolve([]),
      api.matches(eventId),
      api.standings(eventId),
      api.finalRanking(eventId),
      api.whatsapp(eventId),
    ]);
    setPairs(pairData);
    setPayments(paymentData);
    setMatches(matchData);
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
    run(loadBase);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabletAccessToken = pageFromLocation() === "tablet" ? params.get("access") : "";
    if (tabletAccessToken) {
      setLoading(true);
      api.tabletLogin(tabletAccessToken)
        .then(async (response) => {
          setAuthToken(response.access_token);
          setAuthUser(response.user);
          const permissions = await loadPermissions(response.user);
          await loadBase(response.user, permissions);
          await loadEventData(selectedEventId, response.user, permissions);
          window.history.replaceState({}, "", "/tablet");
        })
        .catch((err) => {
          setAuthToken("");
          setError(err.message);
        })
        .finally(() => setLoading(false));
      return;
    }

    api.me()
      .then(async (user) => {
        setAuthUser(user);
        const permissions = await loadPermissions(user);
        await loadBase(user, permissions);
        await loadEventData(selectedEventId, user, permissions);
      })
      .catch(() => setAuthToken(""));
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
      };
      if (selectedEventId) {
        const updated = await api.updateEvent(selectedEventId, payload);
        setSelectedEventId(String(updated.id));
      } else {
        const created = await api.createEvent(payload);
        setSelectedEventId(String(created.id));
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
      await api.createPair(selectedEventId, {
        ...pairForm,
        player_one_id: Number(pairForm.player_one_id),
        player_two_id: pairForm.player_two_id ? Number(pairForm.player_two_id) : null,
      });
      setPairForm({ player_one_id: "", player_two_id: "", category: "", status: "buscando_partner" });
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
      await api.generateFixture(selectedEventId, Number(fixtureForm.guaranteed_matches), courts, {
        format: "groups",
        groupSize: Number(fixtureForm.group_size || 4),
        courtsPerGroup: 2,
        startTime: fixtureForm.start_time || "17:00",
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

    const playerEmail = (authUser?.role === "jugador" ? authUser.email : publicForm.email).trim().toLowerCase();
    const partnerEmail = publicForm.partner_email.trim().toLowerCase();
    const comesWithPartner = Boolean(publicForm.partner_member_id || publicForm.partner_name.trim());

    if (!selectedEventId) {
      setError("Selecciona un evento para inscribirte.");
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
    if (comesWithPartner && !publicForm.partner_member_id && !publicForm.partner_name.trim()) {
      setError("Ingresa el nombre del partner o selecciona un miembro registrado.");
      return;
    }
    if (comesWithPartner && !publicForm.partner_member_id && !isValidEmail(partnerEmail)) {
      setError("Ingresa un email valido para el partner.");
      return;
    }
    if (comesWithPartner && !publicForm.partner_member_id && partnerEmail === playerEmail) {
      setError("El partner debe tener un email distinto al jugador.");
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
      await api.publicRegister(selectedEventId, {
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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitPublicResult(event) {
    event.preventDefault();
    await run(async () => {
      await api.registerResult(selectedEventId, publicResultForm.match_id, {
        pair_one_score: Number(publicResultForm.pair_one_score),
        pair_two_score: Number(publicResultForm.pair_two_score),
      });
      setPublicResultForm(emptyPublicResult);
    });
  }

  async function deleteSelectedEvent() {
    if (!selectedEventId || !selectedEvent) return;
    const confirmed = window.confirm(`Eliminar "${selectedEvent.name}"? Se borraran parejas, pagos, partidos, resultados y ranking de este evento.`);
    if (!confirmed) return;
    await run(async () => {
      await api.deleteEvent(selectedEventId);
      const remainingEvents = await api.events();
      setSelectedEventId(remainingEvents[0] ? String(remainingEvents[0].id) : "");
      setEventForm(emptyEvent);
    });
  }

  async function submitLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await api.login(loginForm);
      setAuthToken(response.access_token);
      setAuthUser(response.user);
      const permissionData = await loadPermissions(response.user);
      await loadBase(response.user, permissionData);
      await loadEventData(selectedEventId, response.user, permissionData);
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
    try {
      const response = await api.registerPlayer({
        ...signupForm,
        phone: signupForm.phone || null,
      });
      setAuthToken(response.access_token);
      setAuthUser(response.user);
      await loadPermissions(response.user);
      setPublicForm({
        ...emptyPublicRegistration,
        name: response.user.name,
        phone: response.user.phone || "",
        category: response.user.category || signupForm.category,
        preferred_side: response.user.preferred_side || "indiferente",
      });
      navigatePage("register");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setAuthToken("");
    setAuthUser(null);
    setPlayers([]);
    setPayments([]);
    setUsers([]);
    setCurrentPermissions(publicPermissions);
    setRolePermissions([]);
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

  async function deleteUser(user) {
    const confirmed = window.confirm(`Eliminar usuario "${user.name}"?`);
    if (!confirmed) return;
    await run(async () => {
      await api.deleteUser(user.id);
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

  const pageContent = page === "register" ? (
    <PublicRegistration
      events={events}
      selectedEventId={selectedEventId}
      setSelectedEventId={setSelectedEventId}
      selectedEvent={selectedEvent}
      authUser={authUser}
      members={members}
      form={publicForm}
      setForm={setPublicForm}
      success={registrationSuccess}
      setSuccess={setRegistrationSuccess}
      onSubmit={submitPublicRegistration}
      loading={loading}
      pairs={pairs}
    />
  ) : page === "signup" ? (
    <SignupPage
      form={signupForm}
      setForm={setSignupForm}
      onSubmit={submitSignup}
      loading={loading}
      goLogin={() => navigatePage("events")}
    />
  ) : page === "results" ? (
    <PublicResults
      events={events}
      pairs={pairs}
      matches={matches}
      standings={standings}
      selectedEventId={selectedEventId}
      setSelectedEventId={setSelectedEventId}
      selectedEvent={selectedEvent}
      form={publicResultForm}
      setForm={setPublicResultForm}
      onSubmit={submitPublicResult}
    />
  ) : page === "tablet" ? (
    <TabletResults
      events={events}
      pairs={pairs}
      matches={matches}
      standings={standings}
      selectedEventId={selectedEventId}
      setSelectedEventId={setSelectedEventId}
      selectedEvent={selectedEvent}
      onSave={run}
      loading={loading}
      onRefresh={() => run(loadBase)}
    />
  ) : page === "users" ? (
    canAccess("users") ? (
      <UsersPage
        authUser={authUser}
        users={users}
        form={userForm}
        setForm={setUserForm}
        onSubmit={submitUser}
        onUpdateUser={updateUser}
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
      pairs={pairs}
      payments={payments}
      matches={matches}
      standings={standings}
      ranking={ranking}
      selectedEvent={selectedEvent}
      selectedEventId={selectedEventId}
      setSelectedEventId={setSelectedEventId}
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
      whatsapp={whatsapp}
      submitEvent={submitEvent}
      submitPlayer={submitPlayer}
      submitPair={submitPair}
      submitMatch={submitMatch}
      submitGenerateFixture={submitGenerateFixture}
      submitGenerateBracket={submitGenerateBracket}
      deleteSelectedEvent={deleteSelectedEvent}
      authUser={authUser}
      run={run}
    /> : <AccessDenied moduleName="Eventos" />
  );

  if (page === "tablet") {
    if (!authUser) {
      return (
        <main className="tablet-shell">
          {error && <div className="alert tablet-alert">{error}</div>}
          <LoginPage form={loginForm} setForm={setLoginForm} onSubmit={submitLogin} loading={loading} compact />
        </main>
      );
    }
    return (
      <main className="tablet-shell">
        {error && <div className="alert tablet-alert">{error}</div>}
        {canAccess("tablet") ? pageContent : <AccessDenied moduleName="Tablet" />}
      </main>
    );
  }

  if (!authUser && ["events", "users", "profiles"].includes(page)) {
    return (
      <main className="app-shell">
        {error && <div className="alert">{error}</div>}
        <LoginPage form={loginForm} setForm={setLoginForm} onSubmit={submitLogin} loading={loading} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Padel Manager</p>
          <h1>Gestión de eventos</h1>
        </div>
        <div className="top-actions">
          <nav className="app-nav" aria-label="Secciones">
            {canAccess("events") && <button className={page === "events" ? "active" : ""} onClick={() => navigatePage("events")}>Eventos</button>}
            {canAccess("register") && <button className={page === "register" ? "active" : ""} onClick={() => navigatePage("register")}>Registro</button>}
            {canAccess("results") && <button className={page === "results" ? "active" : ""} onClick={() => navigatePage("results")}>Resultados</button>}
            {canAccess("users") && (
              <button className={page === "users" ? "active" : ""} onClick={() => navigatePage("users")}>Usuarios</button>
            )}
            {canAccess("profiles") && (
              <button className={page === "profiles" ? "active" : ""} onClick={() => navigatePage("profiles")}>Perfiles</button>
            )}
            {canAccess("tablet") && <button className={page === "tablet" ? "active" : ""} onClick={() => navigatePage("tablet")}>Tablet</button>}
          </nav>
          <button className="icon-button" onClick={() => run(loadBase)} disabled={loading} title="Actualizar">
            <RefreshCw size={18} />
          </button>
          {authUser && <button className="secondary-action" type="button" onClick={logout}>Salir</button>}
        </div>
      </header>

      {error && <div className="alert">{error}</div>}

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

      {pageContent}
    </main>
  );
}

function LoginPage({ form, setForm, onSubmit, loading, compact = false }) {
  return (
    <section className={compact ? "login-page compact" : "login-page"}>
      <div className="login-card">
        <p className="eyebrow">Acceso AmarPadel</p>
        <h1>{compact ? "Acceso operador" : "Panel administrativo"}</h1>
        <p>Ingresa con una cuenta autorizada para administrar eventos, pagos, parejas o resultados.</p>
        <form onSubmit={onSubmit} className="login-form" autoComplete="off">
          <label className="form-field">
            <span>Email</span>
            <input
              type="email"
              name="amar-login-email"
              autoComplete="off"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
          </label>
          <label className="form-field">
            <span>Contraseña</span>
            <input
              type="password"
              name="amar-login-password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
            />
          </label>
          <button disabled={loading}>Entrar</button>
        </form>
      </div>
    </section>
  );
}

function SignupPage({ form, setForm, onSubmit, loading, goLogin }) {
  return (
    <section className="signup-page">
      <div className="signup-card">
        <div className="registration-title">
          <p className="eyebrow">Perfil jugador</p>
          <h2>Crea tu cuenta</h2>
          <p>Guarda tus datos para inscribirte más rápido y ver tus estadísticas cuando activemos el perfil.</p>
        </div>
        <form onSubmit={onSubmit} className="signup-form">
          <label className="form-field">
            <span>Nombre</span>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nombre y apellido" required />
          </label>
          <label className="form-field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="tu@email.com" required />
          </label>
          <label className="form-field">
            <span>Contraseña</span>
            <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
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
          <button disabled={loading}>Crear perfil y continuar</button>
        </form>
        <button type="button" className="secondary-action" onClick={goLogin}>Ya tengo cuenta administrativa</button>
      </div>
    </section>
  );
}

function PublicResults({ events, pairs, matches, standings, selectedEventId, setSelectedEventId, selectedEvent, form, setForm, onSubmit }) {
  const roundNames = [...new Set(matches.map((match) => match.round_name || "Grupo"))];
  const activeRound = form.round_name || roundNames[0] || "";
  const visibleMatches = activeRound ? matches.filter((match) => (match.round_name || "Grupo") === activeRound) : matches;
  const selectedMatch = visibleMatches.find((match) => match.id === Number(form.match_id));
  const pairOne = selectedMatch ? pairs.find((pair) => pair.id === selectedMatch.pair_one_id) : null;
  const pairTwo = selectedMatch ? pairs.find((pair) => pair.id === selectedMatch.pair_two_id) : null;
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
        <p>Selecciona el evento, el partido correspondiente y guarda el resultado para actualizar la tabla automáticamente.</p>
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
            )}

            <button disabled={!selectedEventId || !form.match_id}><FileCheck2 size={16} /> Guardar resultado</button>
          </form>
        </section>
      </div>

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

function TabletResults({ events, pairs, matches, standings, selectedEventId, setSelectedEventId, selectedEvent, onSave, loading, onRefresh }) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [turnFilter, setTurnFilter] = useState("next");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [scores, setScores] = useState({});

  const pairById = useMemo(() => new Map(pairs.map((pair) => [pair.id, pair])), [pairs]);
  const matchRows = useMemo(() => matches
    .map((match) => {
      const schedule = parseFixtureRound(match.round_name);
      const one = pairById.get(match.pair_one_id);
      const two = pairById.get(match.pair_two_id);
      const category = fixtureCategoryFromPairs(one, two, schedule.category);
      return {
        category,
        courtLabel: normalizeCourt(match.court),
        done: hasResult(match),
        group: schedule.group,
        match,
        pairOne: one ? pairName(one) : `Pareja ${match.pair_one_id}`,
        pairTwo: two ? pairName(two) : `Pareja ${match.pair_two_id}`,
        time: schedule.time,
        turn: schedule.turn,
      };
    })
    .sort((a, b) => {
      const timeCompare = minutesFromSlot(a.time || a.turn) - minutesFromSlot(b.time || b.turn);
      if (timeCompare !== 0) return timeCompare;
      return a.courtLabel.localeCompare(b.courtLabel, undefined, { numeric: true });
    }), [matches, pairById]);

  useEffect(() => {
    setScores(Object.fromEntries(matches.map((match) => [
      match.id,
      {
        pair_one_score: match.pair_one_score ?? "",
        pair_two_score: match.pair_two_score ?? "",
      },
    ])));
  }, [matches]);

  const categories = [...new Set(matchRows.map((row) => row.category))];
  const turns = [...new Set(matchRows.map((row) => row.time || row.turn))];
  const nextTurn = turns.find((turn) => matchRows.some((row) => (row.time || row.turn) === turn && !row.done)) || turns[0] || "";
  const activeTurn = turnFilter === "next" ? nextTurn : turnFilter;
  const completedCount = matchRows.filter((row) => row.done).length;
  const pendingCount = matchRows.length - completedCount;
  const standingsByCategory = standings.reduce((groups, standing) => {
    const category = standing.pair.category || "Sin categoria";
    groups[category] = [...(groups[category] || []), standing];
    return groups;
  }, {});

  const visibleRows = matchRows.filter((row) => (
    (categoryFilter === "all" || row.category === categoryFilter)
    && (!activeTurn || (row.time || row.turn) === activeTurn)
    && (statusFilter === "all" || (statusFilter === "pending" ? !row.done : row.done))
  ));

  function setScore(matchId, field, value) {
    const numericValue = Math.max(0, Number(value || 0));
    setScores((current) => ({
      ...current,
      [matchId]: {
        pair_one_score: current[matchId]?.pair_one_score ?? "",
        pair_two_score: current[matchId]?.pair_two_score ?? "",
        [field]: String(numericValue),
      },
    }));
  }

  function bumpScore(matchId, field, amount) {
    const currentValue = Number(scores[matchId]?.[field] || 0);
    setScore(matchId, field, currentValue + amount);
  }

  function saveMatch(matchId) {
    const current = scores[matchId] || {};
    return onSave(() => api.registerResult(selectedEventId, matchId, {
      pair_one_score: Number(current.pair_one_score),
      pair_two_score: Number(current.pair_two_score),
    }));
  }

  return (
    <section className="tablet-page">
      <div className="tablet-top">
        <strong>{selectedEvent ? selectedEvent.name : "Mesa de resultados"}</strong>
        <span>{completedCount}/{matchRows.length} cargados · {pendingCount} pendientes</span>
        <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>
          <option value="">Evento</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
        </select>
        <button type="button" className="tablet-refresh" onClick={onRefresh} disabled={loading} title="Actualizar">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="tablet-controls">
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">Todas las categorías</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select value={turnFilter} onChange={(event) => setTurnFilter(event.target.value)}>
          <option value="next">Próximo turno</option>
          {turns.map((turn) => <option key={turn} value={turn}>{turn}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="pending">Pendientes</option>
          <option value="done">Cargados</option>
          <option value="all">Todos</option>
        </select>
      </div>

      <div className="tablet-match-grid">
        {visibleRows.length ? visibleRows.map((row) => {
          const current = scores[row.match.id] || { pair_one_score: "", pair_two_score: "" };
          const canSave = selectedEventId && current.pair_one_score !== "" && current.pair_two_score !== "";
          return (
            <article className={`tablet-match ${row.done ? "done" : ""}`} key={row.match.id}>
              <div className="tablet-match-head">
                <span>{row.time || row.turn}</span>
                <strong>{row.courtLabel}</strong>
                <em>{row.category}{row.group ? ` · ${row.group}` : ""}</em>
              </div>
              <div className="tablet-score-row">
                <strong>{row.pairOne}</strong>
                <div className="tablet-score-control">
                  <button type="button" onClick={() => bumpScore(row.match.id, "pair_one_score", -1)}>-</button>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={current.pair_one_score}
                    onChange={(event) => setScore(row.match.id, "pair_one_score", event.target.value)}
                  />
                  <button type="button" onClick={() => bumpScore(row.match.id, "pair_one_score", 1)}>+</button>
                </div>
              </div>
              <div className="tablet-versus">vs</div>
              <div className="tablet-score-row">
                <strong>{row.pairTwo}</strong>
                <div className="tablet-score-control">
                  <button type="button" onClick={() => bumpScore(row.match.id, "pair_two_score", -1)}>-</button>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={current.pair_two_score}
                    onChange={(event) => setScore(row.match.id, "pair_two_score", event.target.value)}
                  />
                  <button type="button" onClick={() => bumpScore(row.match.id, "pair_two_score", 1)}>+</button>
                </div>
              </div>
              <button className="tablet-save" type="button" disabled={!canSave || loading} onClick={() => saveMatch(row.match.id)}>
                <Check size={16} /> {row.done ? "OK" : "Guardar"}
              </button>
            </article>
          );
        }) : (
          <div className="tablet-empty">No hay partidos con esos filtros.</div>
        )}
      </div>

      <section className="tablet-ranking" aria-label="Ranking resumido">
        {Object.entries(standingsByCategory).map(([category, categoryStandings]) => (
          <article key={category}>
            <strong>{category}</strong>
            {categoryStandings.slice(0, 5).map((standing) => (
              <span key={standing.id}>{standing.position}. {pairName(standing.pair)} · {standing.points} pts</span>
            ))}
          </article>
        ))}
      </section>
    </section>
  );
}

function EventsPage(props) {
  const [eventTab, setEventTab] = useState("organization");
  const {
    events,
    players,
    pairs,
    payments,
    matches,
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
    whatsapp,
    submitEvent,
    submitPlayer,
    submitPair,
    submitMatch,
    submitGenerateFixture,
    submitGenerateBracket,
    deleteSelectedEvent,
    authUser,
    run,
  } = props;
  const completePairsCount = pairs.filter((pair) => pair.status === "completa" && pair.player_two_id).length;
  const categoriesWithFinals = new Set(
    pairs
      .filter((pair) => pair.status === "completa" && pair.player_two_id)
      .map((pair) => pair.category)
  ).size;
  const finalMatches = categoriesWithFinals * 2;
  const estimatedMatches = Math.ceil((completePairsCount * Number(fixtureForm.guaranteed_matches || 0)) / 2);
  const estimatedMatchesWithFinals = estimatedMatches + finalMatches;
  const slotsPerCourt = Math.max(1, Math.floor(Number(fixtureForm.rental_minutes || 0) / Number(fixtureForm.set_minutes || 1)));
  const recommendedCourts = estimatedMatches ? Math.ceil(estimatedMatches / slotsPerCourt) : 0;
  const recommendedCourtsWithFinals = estimatedMatchesWithFinals ? Math.ceil(estimatedMatchesWithFinals / slotsPerCourt) : 0;
  const configuredCourts = Number(fixtureForm.court_count || 0);
  const playerOptions = mergePlayersFromPairs(players, pairs);

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
      description: selectedEvent.description || "",
      is_active: selectedEvent.is_active ?? true,
    });
  }, [selectedEvent?.id]);

  return (
    <section className="workspace">
      <section className="panel main-panel">
        <div className="section-head">
          <h2><ListChecks size={18} /> Operación del evento</h2>
          <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
            <option value="">Seleccionar evento</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select>
        </div>

        {selectedEvent ? (
          <>
            <div className="event-summary">
              <strong>{selectedEvent.name}</strong>
              <span>{selectedEvent.date} - {selectedEvent.place} - {selectedEvent.categories}</span>
            </div>

            <div className="event-tabs">
              <button className={eventTab === "organization" ? "active" : ""} onClick={() => setEventTab("organization")}>Organización</button>
              <button className={eventTab === "event" ? "active" : ""} onClick={() => setEventTab("event")}>Evento</button>
              <button className={eventTab === "matches" ? "active" : ""} onClick={() => setEventTab("matches")}>Partidos</button>
              <button className={eventTab === "payments" ? "active" : ""} onClick={() => setEventTab("payments")}>Pagos</button>
              <button className={eventTab === "ranking" ? "active" : ""} onClick={() => setEventTab("ranking")}>Ranking</button>
            </div>

            {eventTab === "event" && (
              <div className="organization-section">
                <EventForm form={eventForm} setForm={setEventForm} onSubmit={submitEvent} isEditing={Boolean(selectedEventId)} />
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

            {eventTab === "organization" && (
            <>
            <div className="columns">
              <div>
                <h3><UserPlus size={16} /> Jugadores</h3>
                <form onSubmit={submitPlayer} className="compact-form">
                  <input placeholder="Nombre" value={playerForm.name} onChange={(e) => setPlayerForm({ ...playerForm, name: e.target.value })} required />
                  <input placeholder="Teléfono" value={playerForm.phone} onChange={(e) => setPlayerForm({ ...playerForm, phone: e.target.value })} />
                  <CategorySelect value={playerForm.category} onChange={(value) => setPlayerForm({ ...playerForm, category: value })} />
                  <select value={playerForm.preferred_side} onChange={(e) => setPlayerForm({ ...playerForm, preferred_side: e.target.value })}>
                    <option value="drive">Drive</option>
                    <option value="reves">Revés</option>
                    <option value="indiferente">Indiferente</option>
                  </select>
                  <button><UserPlus size={16} /> Agregar</button>
                </form>
              </div>

              <div>
                <h3><Users size={16} /> Parejas</h3>
                <form onSubmit={submitPair} className="compact-form">
                  <select value={pairForm.player_one_id} onChange={(e) => setPairForm({ ...pairForm, player_one_id: e.target.value })} required>
                    <option value="">Jugador 1</option>
                    {playerOptions.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                  </select>
                  <select value={pairForm.player_two_id} onChange={(e) => setPairForm({ ...pairForm, player_two_id: e.target.value })}>
                    <option value="">Jugador 2 opcional</option>
                    {playerOptions.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                  </select>
                  <CategorySelect value={pairForm.category} onChange={(value) => setPairForm({ ...pairForm, category: value })} />
                  <select value={pairForm.status} onChange={(e) => setPairForm({ ...pairForm, status: e.target.value })}>
                    <option value="completa">Completa</option>
                    <option value="buscando_partner">Buscando partner</option>
                    <option value="lista_espera">Lista de espera</option>
                  </select>
                  <button><Users size={16} /> Crear pareja</button>
                </form>
              </div>
            </div>

            <div className="data-grid">
                  <PairsBlock pairs={pairs} players={playerOptions} eventId={selectedEventId} onChange={run} />
            </div>

            </>
            )}

            {eventTab === "matches" && (
            <div className="organization-section">
              <div className="data-block fixture-card">
                <div className="block-head">
                  <h3><Swords size={16} /> Partidos</h3>
                </div>
                <div className="fixture-workbench">
                  <div>
                    <details className="fixture-config" open={!matches.length}>
                      <summary>Configurar programación</summary>
                    <div className="fixture-controls">
                      <label className="wide-field">
                        Modalidad
                        <select value={fixtureForm.mode} onChange={(e) => setFixtureForm({ ...fixtureForm, mode: e.target.value })}>
                          <option value="groups">Todos contra todos por grupos</option>
                          <option value="bracket">Torneo desde ranking</option>
                        </select>
                      </label>
                      <label>
                        Parejas por grupo
                        <input type="number" min="2" value={fixtureForm.group_size} onChange={(e) => setFixtureForm({ ...fixtureForm, group_size: e.target.value })} />
                      </label>
                      <label>
                        Partidos garantizados
                        <input type="number" min="1" value={fixtureForm.guaranteed_matches} onChange={(e) => setFixtureForm({ ...fixtureForm, guaranteed_matches: e.target.value })} />
                      </label>
                      <label>
                        Arriendo minutos
                        <input type="number" min="1" value={fixtureForm.rental_minutes} onChange={(e) => setFixtureForm({ ...fixtureForm, rental_minutes: e.target.value })} />
                      </label>
                      <label>
                        Minutos por set
                        <input type="number" min="1" value={fixtureForm.set_minutes} onChange={(e) => setFixtureForm({ ...fixtureForm, set_minutes: e.target.value })} />
                      </label>
                      <label>
                        Hora inicio
                        <input type="time" value={fixtureForm.start_time} onChange={(e) => setFixtureForm({ ...fixtureForm, start_time: e.target.value })} />
                      </label>
                      <label>
                        Cantidad canchas
                        <input
                          type="number"
                          min="1"
                          value={fixtureForm.court_count}
                          onChange={(e) => {
                            const count = Number(e.target.value) || 1;
                            setFixtureForm({
                              ...fixtureForm,
                              court_count: e.target.value,
                              courts: Array.from({ length: count }, (_, index) => String(index + 1)).join(", "),
                            });
                          }}
                        />
                      </label>
                      <label className="wide-field">
                        Números de cancha
                        <input placeholder="1, 2, 3" value={fixtureForm.courts} onChange={(e) => setFixtureForm({ ...fixtureForm, courts: e.target.value })} />
                      </label>
                      <div className={`fixture-advice wide-field ${configuredCourts < recommendedCourtsWithFinals ? "warning" : "ok"}`}>
                        <strong>{recommendedCourtsWithFinals || 0} canchas recomendadas con finales</strong>
                        <span>
                          {estimatedMatches} partidos de fase + {finalMatches} finales/terceros en {categoriesWithFinals} categoría(s).
                          {` ${slotsPerCourt} turnos por cancha.`}
                          {configuredCourts < recommendedCourtsWithFinals
                            ? ` Con ${configuredCourts || 0} cancha(s) no alcanza para jugar grupos y finales.`
                            : " La configuración alcanza para el bloque."}
                        </span>
                        <small>Sin finales: {recommendedCourts || 0} cancha(s). Para cada categoría se estima final y partido por 3er lugar.</small>
                      </div>
                      {fixtureForm.mode === "groups" ? (
                        <button className="secondary-action wide-field" type="button" onClick={submitGenerateFixture} disabled={!selectedEventId}>
                          <Swords size={16} /> Generar todos contra todos
                        </button>
                      ) : (
                        <button className="secondary-action wide-field" type="button" onClick={submitGenerateBracket} disabled={!selectedEventId}>
                          <Swords size={16} /> Generar torneo desde ranking
                        </button>
                      )}
                    </div>
                    </details>
                    <details className="manual-match">
                      <summary>Agregar partido manual</summary>
                    <form onSubmit={submitMatch} className="compact-form">
                      <PairSelect label="Pareja 1" value={matchForm.pair_one_id} pairs={pairs} onChange={(value) => setMatchForm({ ...matchForm, pair_one_id: value })} />
                      <PairSelect label="Pareja 2" value={matchForm.pair_two_id} pairs={pairs} onChange={(value) => setMatchForm({ ...matchForm, pair_two_id: value })} />
                      <input placeholder="Ronda" value={matchForm.round_name} onChange={(e) => setMatchForm({ ...matchForm, round_name: e.target.value })} />
                      <input placeholder="Cancha" value={matchForm.court} onChange={(e) => setMatchForm({ ...matchForm, court: e.target.value })} />
                      <button><Swords size={16} /> Crear partido</button>
                    </form>
                    </details>
                  </div>
                </div>
                <FixturePreview
                  matches={matches}
                  pairs={pairs}
                  configuredCourts={fixtureForm.courts}
                  resultForm={resultForm}
                  setResultForm={setResultForm}
                  eventId={selectedEventId}
                  onChange={run}
                  rentalMinutes={Number(fixtureForm.rental_minutes || 120)}
                  startTime={fixtureForm.start_time}
                />
                <DynamicFourTaPlan matches={matches} pairs={pairs} eventId={selectedEventId} onChange={run} />
                <TournamentBracket matches={matches} pairs={pairs} />
              </div>
            </div>
            )}

            {eventTab === "payments" && (
              <div className="payments-grid">
                <PaymentBlock payments={payments} pairs={pairs} players={players} eventId={selectedEventId} onChange={run} />
                <div className="data-block">
                  <h3><Clipboard size={16} /> WhatsApp</h3>
                  <textarea className="whatsapp" value={whatsapp} readOnly />
                </div>
              </div>
            )}

            {eventTab === "ranking" && (
              <div className="ranking-admin-grid">
                <RankingBlock ranking={ranking} standings={standings} />
              </div>
            )}

          </>
        ) : (
          <div className="organization-section">
            <p className="empty">No hay eventos cargados todavía. Crea el primero para comenzar.</p>
            <EventForm form={eventForm} setForm={setEventForm} onSubmit={submitEvent} isEditing={false} />
          </div>
        )}
      </section>
    </section>
  );
}

function EventForm({ form, setForm, onSubmit, isEditing }) {
  function updateCategoryConfig(index, patch) {
    const configs = [...(form.category_configs || [])];
    configs[index] = { ...configs[index], ...patch };
    setForm({ ...form, category_configs: configs });
  }

  function addCategoryConfig(config = defaultCategoryConfig) {
    setForm({ ...form, category_configs: [...(form.category_configs || []), { ...config }] });
  }

  function removeCategoryConfig(index) {
    setForm({ ...form, category_configs: (form.category_configs || []).filter((_, itemIndex) => itemIndex !== index) });
  }

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
          <span>Categorías</span>
          <input placeholder="4ta / 5ta" value={form.categories} onChange={(e) => setForm({ ...form, categories: e.target.value })} required />
          <small>Texto resumen de categorías.</small>
        </label>
        <label className="form-field">
          <span>Precio</span>
          <input type="number" placeholder="13000" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          <small>Valor por jugador o inscripción, según tu criterio.</small>
        </label>
        <label className="form-field">
          <span>Horario</span>
          <input placeholder="21:00 a 23:00" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} required />
          <small>Bloque horario del evento.</small>
        </label>
        <label className="form-field">
          <span>Cupos</span>
          <input type="number" placeholder="56" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          <small>Total máximo de jugadores/inscritos.</small>
        </label>
        <label className="form-field">
          <span>Tipo de torneo</span>
          <input placeholder="Americano, grupos, ranking..." value={form.tournament_type} onChange={(e) => setForm({ ...form, tournament_type: e.target.value })} required />
          <small>Descripción interna del formato general.</small>
        </label>
        <div className="category-configs">
          <div className="block-head">
            <div>
              <h3>Modalidad por categoría</h3>
              <p className="field-help">Define cómo se arma y calcula cada categoría dentro del mismo evento.</p>
            </div>
            <button type="button" className="secondary-action" onClick={() => setForm({ ...form, category_configs: amarTodayCategoryConfigs.map((config) => ({ ...config })) })}>
              Usar formato AMAR hoy
            </button>
          </div>
          {(form.category_configs || []).length ? (
            <div className="category-config-list">
              {form.category_configs.map((config, index) => (
                <div className="category-config-row" key={`${config.category}-${index}`}>
                  <label className="form-field compact">
                    <span>Categoría</span>
                    <input
                      placeholder="5ta"
                      value={config.category}
                      onChange={(e) => updateCategoryConfig(index, { category: e.target.value })}
                    />
                  </label>
                  <label className="form-field compact">
                    <span>Modalidad</span>
                    <select value={config.modality} onChange={(e) => updateCategoryConfig(index, { modality: e.target.value })}>
                      {modalityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="form-field compact">
                    <span>Parejas/grupo</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="6"
                      value={config.group_size}
                      onChange={(e) => updateCategoryConfig(index, { group_size: e.target.value })}
                    />
                  </label>
                  <label className="form-field compact">
                    <span>Partidos garantizados</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="5"
                      value={config.guaranteed_matches}
                      onChange={(e) => updateCategoryConfig(index, { guaranteed_matches: e.target.value })}
                    />
                  </label>
                  <label className="form-field compact">
                    <span>Clasifican/grupo</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="1"
                      value={config.qualifiers_per_group}
                      onChange={(e) => updateCategoryConfig(index, { qualifiers_per_group: e.target.value })}
                    />
                  </label>
                  <label className="form-field compact">
                    <span>Notas</span>
                    <input
                      placeholder="Regla o comentario"
                      value={config.notes || ""}
                      onChange={(e) => updateCategoryConfig(index, { notes: e.target.value })}
                    />
                  </label>
                  <button type="button" className="danger-action" onClick={() => removeCategoryConfig(index)}>Quitar</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Sin modalidades configuradas por categoría.</p>
          )}
          <button type="button" className="secondary-action" onClick={() => addCategoryConfig()}>
            Agregar modalidad
          </button>
        </div>
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

function UsersPage({ authUser, users, form, setForm, onSubmit, onUpdateUser, onDeleteUser }) {
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
        onDeleteUser={onDeleteUser}
      />
    </section>
  );
}

function UsersBlock({ authUser, users, form, setForm, onSubmit, onUpdateUser, onDeleteUser }) {
  const [query, setQuery] = useState("");
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
            onDeleteUser={onDeleteUser}
          />
        )) : (
          <p className="empty">No hay usuarios con ese filtro.</p>
        )}
      </div>
    </div>
  );
}

function UserAdminRow({ user, authUser, roleLabels, onUpdateUser, onDeleteUser }) {
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
        <button type="button" className="danger-action" onClick={() => onDeleteUser(user)} disabled={isSelf}>Eliminar</button>
      </div>
    </div>
  );
}

function PublicRegistration({ events, selectedEventId, setSelectedEventId, selectedEvent, authUser, members, form, setForm, success, setSuccess, onSubmit, loading, pairs }) {
  const [partnerMode, setPartnerMode] = useState("searching");
  const [partnerSource, setPartnerSource] = useState("member");
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

  function useGuestPartner() {
    setPartnerSource("guest");
    setForm({
      ...form,
      partner_member_id: "",
      partner_name: "",
      partner_email: "",
      partner_phone: "",
      partner_preferred_side: "indiferente",
    });
  }

  return (
    <section className="public-page">
      <div className="registration-shell">
        <section className="registration-stage">
          <div className="registration-title">
            <p className="eyebrow">Registro jugadores</p>
            <h2>Inscripción al evento</h2>
            <p>Elige dónde jugar, completa tus datos y confirma si vienes con partner.</p>
          </div>
          <div className="profile-callout">
            {authUser?.role === "jugador" ? (
              <>
                <strong>Inscribiendo como {authUser.name}</strong>
                <span>Tus datos se cargaron desde tu perfil.</span>
              </>
            ) : (
              <>
                <strong>¿Juegas seguido?</strong>
                <span>Crea tu perfil para no llenar tus datos cada vez.</span>
                <button type="button" className="secondary-action" onClick={() => { window.location.href = "/crear-cuenta"; }}>
                  Crear perfil jugador
                </button>
              </>
            )}
          </div>

          <div className="registration-steps" aria-label="Pasos de inscripción">
            <span className={selectedEventId ? "done" : "active"}>1. Evento</span>
            <span className={form.name ? "done" : selectedEventId ? "active" : ""}>2. Datos</span>
            <span className={form.name && selectedEventId ? "active" : ""}>3. Confirmar</span>
          </div>

          <div className="registration-event-cards">
            {events.map((event) => {
              const isSelected = String(event.id) === String(selectedEventId);
              return (
                <button
                  type="button"
                  className={`registration-event-card ${isSelected ? "active" : ""}`}
                  key={event.id}
                  onClick={() => {
                    setSelectedEventId(String(event.id));
                    setForm({ ...form, category: "" });
                  }}
                >
                  <strong>{event.name}</strong>
                  <span>{event.date} · {event.schedule}</span>
                  <span>{event.place}</span>
                  <em>{event.categories}</em>
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel registration-panel">
          {success && (
            <div className="registration-success">
              <strong>Inscripción registrada</strong>
              <span>
                {success.playerName}
                {success.partnerName ? ` y ${success.partnerName}` : ""} quedaron inscritos en {success.eventName}.
              </span>
              <button type="button" className="secondary-action" onClick={() => setSuccess(null)}>Inscribir otra persona</button>
            </div>
          )}
          <div className="block-head">
            <h2><UserPlus size={18} /> Datos de inscripción</h2>
            <span className={`registration-status ${hasPartner ? "complete" : "searching"}`}>
              {hasPartner ? "Pareja completa" : "Buscando partner"}
            </span>
          </div>
          <form onSubmit={onSubmit} className="registration-form">
            <label className="form-field">
              <span>Nombre jugador</span>
              <input placeholder="Nombre y apellido" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label className="form-field">
              <span>Email</span>
              <input
                type="email"
                placeholder="correo@dominio.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                disabled={authUser?.role === "jugador"}
              />
            </label>
            <label className="form-field">
              <span>Teléfono</span>
              <input placeholder="Opcional" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="form-field">
              <span>Categoría</span>
              <select value={selectedCategory} onChange={(e) => setForm({ ...form, category: e.target.value })}>
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

            <div className="form-divider">Partner</div>
            <div className="registration-choice">
              <button
                type="button"
                className={!hasPartner ? "active" : ""}
                onClick={() => {
                  setPartnerMode("searching");
                  setForm({ ...form, partner_member_id: "", partner_name: "", partner_email: "", partner_phone: "", partner_paid: false });
                }}
              >
                Busco partner
              </button>
              <button type="button" className={hasPartner ? "active" : ""} onClick={() => setPartnerMode("complete")}>
                Vengo con partner
              </button>
            </div>

            {hasPartner && (
              <>
                <div className="partner-source">
                  <button
                    type="button"
                    className={partnerSource === "member" ? "active" : ""}
                    onClick={() => {
                      setPartnerSource("member");
                      setForm({ ...form, partner_member_id: "", partner_name: "", partner_email: "", partner_phone: "", partner_preferred_side: "indiferente" });
                    }}
                  >
                    Miembro registrado
                  </button>
                  <button
                    type="button"
                    className={partnerSource === "guest" ? "active" : ""}
                    onClick={useGuestPartner}
                  >
                    Invitado sin cuenta
                  </button>
                </div>

                {partnerSource === "member" ? (
                  <>
                    <label className="form-field wide-field">
                      <span>Seleccionar partner</span>
                      <select value={form.partner_member_id} onChange={(e) => applyPartnerMember(e.target.value)} required={hasPartner && partnerSource === "member"}>
                        <option value="">Buscar en miembros registrados</option>
                        {availableMembers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}{member.category ? ` · ${member.category}` : ""}{member.preferred_side ? ` · ${member.preferred_side}` : ""}
                          </option>
                        ))}
                      </select>
                      <small>Si no aparece en esta lista, usa Invitado sin cuenta.</small>
                    </label>
                    {selectedPartnerMember && (
                      <div className="member-preview">
                        <strong>{selectedPartnerMember.name}</strong>
                        <span>{selectedPartnerMember.category || "Sin categoría"} · {selectedPartnerMember.preferred_side || "lado indiferente"}</span>
                        {selectedPartnerMember.phone && <small>{selectedPartnerMember.phone}</small>}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <label className="form-field">
                      <span>Nombre partner</span>
                      <input placeholder="Nombre y apellido" value={form.partner_name} onChange={(e) => setForm({ ...form, partner_name: e.target.value })} required={hasPartner && partnerSource === "guest"} />
                    </label>
                    <label className="form-field">
                      <span>Email partner</span>
                      <input
                        type="email"
                        placeholder="correo@dominio.com"
                        value={form.partner_email}
                        onChange={(e) => setForm({ ...form, partner_email: e.target.value })}
                        required={hasPartner && partnerSource === "guest"}
                      />
                    </label>
                    <label className="form-field">
                      <span>Teléfono partner</span>
                      <input placeholder="Opcional" value={form.partner_phone} onChange={(e) => setForm({ ...form, partner_phone: e.target.value })} />
                    </label>
                    <label className="form-field">
                      <span>Lado partner</span>
                      <select value={form.partner_preferred_side} onChange={(e) => setForm({ ...form, partner_preferred_side: e.target.value })}>
                        <option value="drive">Drive</option>
                        <option value="reves">Revés</option>
                        <option value="indiferente">Indiferente</option>
                      </select>
                    </label>
                  </>
                )}
              </>
            )}
            <div className="form-divider">Pago</div>
            <label className="payment-toggle">
              <input
                type="checkbox"
                checked={form.paid}
                onChange={(e) => setForm({ ...form, paid: e.target.checked })}
              />
              <span>
                <strong>Jugador pagó inscripción</strong>
                <small>Se marcará como pagado en pagos del evento.</small>
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
                  <strong>Partner pagó inscripción</strong>
                  <small>Se marcará como pagado junto con la pareja.</small>
                </span>
              </label>
            )}
            <button disabled={loading || !selectedEventId || !form.name.trim() || !form.email.trim() || (hasPartner && (!form.partner_name.trim() || (partnerSource === "guest" && !form.partner_email.trim())))}>
              <UserPlus size={16} /> {loading ? "Registrando..." : "Confirmar inscripción"}
            </button>
          </form>
        </section>

        <aside className="registration-summary">
          <div>
            <span>Evento</span>
            <strong>{selectedEvent?.name || "Selecciona un evento"}</strong>
            {selectedEvent && <small>{selectedEvent.date} · {selectedEvent.schedule}</small>}
          </div>
          <div>
            <span>Jugador</span>
            <strong>{form.name || "Pendiente"}</strong>
            <small>{selectedCategory || "Sin categoría"} · {form.paid ? "Pagado" : "Pago pendiente"}</small>
          </div>
          <div>
            <span>Partner</span>
            <strong>{hasPartner ? (form.partner_name || "Pendiente") : "Buscando partner"}</strong>
            <small>{hasPartner ? (form.partner_paid ? "Pareja completa · pagado" : "Pareja completa · pago pendiente") : "Te anotamos individualmente"}</small>
          </div>
          <section className="registered-list">
            <div className="block-head">
              <h2><ListChecks size={18} /> Inscritos</h2>
              <span>{selectedEventPairs.length} parejas</span>
            </div>
            <div className="registered-list-items">
              {selectedEventPairs.length ? selectedEventPairs.map((pair) => (
                <div key={pair.id} className="registered-list-item">
                  <strong>{pairName(pair)}</strong>
                  <small>{pair.category} · {pair.status === "buscando_partner" ? "Buscando partner" : "Pareja completa"}</small>
                </div>
              )) : <p className="muted">Sin inscritos todavia</p>}
            </div>
          </section>
        </aside>
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

function DataBlock({ title, rows }) {
  return (
    <article className="data-block">
      <h3>{title}</h3>
      {rows.length ? rows.map((row, index) => <p key={`${row}-${index}`}>{row}</p>) : <p className="muted">Sin registros</p>}
    </article>
  );
}

function PairsBlock({ pairs, players, eventId, onChange }) {
  const completePairs = pairs.filter((pair) => pair.status === "completa");
  const searchingPairs = pairs.filter((pair) => pair.status === "buscando_partner");
  const waitlistPairs = pairs.filter((pair) => pair.status === "lista_espera");
  const sections = [
    ["Parejas completas", completePairs],
    ["Buscando partner", searchingPairs],
    ["Lista de espera", waitlistPairs],
  ];

  return (
    <article className="data-block pairs-block">
      <div className="block-head">
        <h3>Inscritos</h3>
        <div className="mini-stats">
          <span>{completePairs.length} completas</span>
          <span>{searchingPairs.length} buscando</span>
          <span>{waitlistPairs.length} espera</span>
        </div>
      </div>
      {pairs.length ? (
        <div className="pairs-list">
          {sections.map(([title, sectionPairs]) => (
            sectionPairs.length > 0 && (
              <section className="pair-section" key={title}>
                <strong>{title}</strong>
                {sectionPairs.map((pair) => (
                  <div className="pair-admin-row" key={pair.id}>
                    <select
                      value={pair.player_one_id}
                      onChange={(event) => onChange(() => api.updatePair(eventId, pair.id, {
                        player_one_id: Number(event.target.value),
                      }))}
                    >
                      {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                    </select>
                    <select
                      value={pair.player_two_id || ""}
                      onChange={(event) => {
                        const playerTwoId = event.target.value ? Number(event.target.value) : null;
                        onChange(() => api.updatePair(eventId, pair.id, {
                          player_two_id: playerTwoId,
                          status: playerTwoId ? "completa" : "buscando_partner",
                        }));
                      }}
                    >
                      <option value="">Sin partner</option>
                      {players
                        .filter((player) => player.id !== pair.player_one_id)
                        .map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                    </select>
                    <CategorySelect
                      value={pair.category}
                      onChange={(category) => onChange(() => api.updatePair(eventId, pair.id, { category }))}
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
                        const confirmed = window.confirm(`Eliminar ${pairName(pair)} del evento? Tambien se borraran sus partidos y resultados asociados.`);
                        if (confirmed) onChange(() => api.deletePair(eventId, pair.id));
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
        <p className="muted">Sin inscritos</p>
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

function RankingBlock({ ranking, standings }) {
  const standingsByCategory = standings.reduce((groups, standing) => {
    const category = standing.pair.category || "Sin categoria";
    groups[category] = [...(groups[category] || []), standing];
    return groups;
  }, {});

  return (
    <article className="data-block">
      <h3><Medal size={16} /> Ranking</h3>
      {Object.entries(standingsByCategory).length ? (
        <div className="ranking-grid">
          {Object.entries(standingsByCategory).map(([category, categoryStandings]) => (
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
          ))}
        </div>
      ) : (
        (ranking.length ? ranking : []).map((standing) => (
          <p key={standing.id}>{standing.position}. {pairName(standing.pair)} - {standing.points} pts</p>
        ))
      )}
    </article>
  );
}

function PairSelect({ label, value, pairs, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">{label}</option>
      {pairs.map((pair) => <option key={pair.id} value={pair.id}>{pairName(pair)}</option>)}
    </select>
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

function DynamicFourTaPlan({ matches, pairs, eventId, onChange }) {
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
  const groupMatches = matches
    .map((match) => {
      const schedule = parseFixtureRound(match.round_name);
      const pairOne = pairById.get(match.pair_one_id);
      const pairTwo = pairById.get(match.pair_two_id);
      const category = fixtureCategoryFromPairs(pairOne, pairTwo, schedule.category);
      return { match, schedule, pairOne, pairTwo, category };
    })
    .filter((row) => row.category === "4ta" && /^Grupo\s+/i.test(row.schedule.group || ""));

  if (!groupMatches.length) return null;

  const groups = groupMatches.reduce((collection, row) => {
    const groupName = row.schedule.group;
    if (!collection[groupName]) collection[groupName] = new Map();
    [row.pairOne, row.pairTwo].filter(Boolean).forEach((pair) => {
      if (!collection[groupName].has(pair.id)) collection[groupName].set(pair.id, emptyStanding(pair));
    });

    if (isNumericScore(row.match.pair_one_score) && isNumericScore(row.match.pair_two_score)) {
      const one = collection[groupName].get(row.match.pair_one_id);
      const two = collection[groupName].get(row.match.pair_two_id);
      const oneScore = Number(row.match.pair_one_score);
      const twoScore = Number(row.match.pair_two_score);
      one.played += 1;
      two.played += 1;
      one.pointsFor += oneScore;
      one.pointsAgainst += twoScore;
      two.pointsFor += twoScore;
      two.pointsAgainst += oneScore;
      if (oneScore > twoScore) {
        one.won += 1;
        two.lost += 1;
        one.points += 3;
      } else if (twoScore > oneScore) {
        two.won += 1;
        one.lost += 1;
        two.points += 3;
      } else {
        one.points += 1;
        two.points += 1;
      }
    }
    return collection;
  }, {});

  const orderedGroupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const groupLeaders = Object.fromEntries(
    orderedGroupNames.map((groupName) => [groupName, sortStandings([...groups[groupName].values()])[0] || null]),
  );
  const groupRows = orderedGroupNames.map((groupName) => ({
    groupName,
    standings: sortStandings([...groups[groupName].values()]),
    leader: groupLeaders[groupName],
  }));

  const semiOne = {
    court: "Cancha 1",
    time: "22:15",
    label: "Semifinal 1",
    one: groupLeaders["Grupo A"]?.pair,
    two: groupLeaders["Grupo D"]?.pair,
  };
  const semiTwo = {
    court: "Cancha 3",
    time: "22:15",
    label: "Semifinal 2",
    one: groupLeaders["Grupo B"]?.pair,
    two: groupLeaders["Grupo C"]?.pair,
  };
  const existingSemiOne = matches.find((match) => /4ta/i.test(match.round_name || "") && /Semifinal 1/i.test(match.round_name || ""));
  const existingSemiTwo = matches.find((match) => /4ta/i.test(match.round_name || "") && /Semifinal 2/i.test(match.round_name || ""));
  const existingFinal = matches.find((match) => /4ta/i.test(match.round_name || "") && /\bTorneo - Final\b/i.test(match.round_name || ""));
  const existingThirdPlace = matches.find((match) => /4ta/i.test(match.round_name || "") && /3er lugar/i.test(match.round_name || ""));
  const semiOneResult = resolveMatchResult(existingSemiOne);
  const semiTwoResult = resolveMatchResult(existingSemiTwo);
  const finalPairs = [semiOneResult.winnerId, semiTwoResult.winnerId].map((id) => pairById.get(id)).filter(Boolean);
  const thirdPlacePairs = [semiOneResult.loserId, semiTwoResult.loserId].map((id) => pairById.get(id)).filter(Boolean);
  const canCreateSemis = eventId && semiOne.one && semiOne.two && semiTwo.one && semiTwo.two && (!existingSemiOne || !existingSemiTwo);
  const canCreateFinals = eventId && finalPairs.length === 2 && thirdPlacePairs.length === 2 && (!existingFinal || !existingThirdPlace);

  function createSemifinals() {
    return onChange(() => Promise.all([
      !existingSemiOne && api.createMatch(eventId, {
        pair_one_id: semiOne.one.id,
        pair_two_id: semiOne.two.id,
        round_name: "4ta - Torneo - Semifinal 1 - 22:15",
        court: "cancha 1",
      }),
      !existingSemiTwo && api.createMatch(eventId, {
        pair_one_id: semiTwo.one.id,
        pair_two_id: semiTwo.two.id,
        round_name: "4ta - Torneo - Semifinal 2 - 22:15",
        court: "cancha 3",
      }),
    ].filter(Boolean)));
  }

  function createFinals() {
    return onChange(() => Promise.all([
      !existingFinal && api.createMatch(eventId, {
        pair_one_id: finalPairs[0].id,
        pair_two_id: finalPairs[1].id,
        round_name: "4ta - Torneo - Final - 22:40",
        court: "cancha 1",
      }),
      !existingThirdPlace && api.createMatch(eventId, {
        pair_one_id: thirdPlacePairs[0].id,
        pair_two_id: thirdPlacePairs[1].id,
        round_name: "4ta - Torneo - 3er lugar - 22:40",
        court: "cancha 3",
      }),
    ].filter(Boolean)));
  }

  return (
    <article className="data-block dynamic-plan">
      <div className="block-head">
        <h3>Clasificación dinámica 4ta</h3>
        <span>Mejor de cada grupo</span>
      </div>
      <div className="qualifier-grid">
        {groupRows.map(({ groupName, leader, standings }) => (
          <div className="qualifier-card" key={groupName}>
            <span>{groupName}</span>
            <strong>{leader ? pairName(leader.pair) : "Pendiente"}</strong>
            <small>
              {leader
                ? `${leader.points} pts · ${leader.won}G · dif ${standingDiff(leader)}`
                : "Faltan resultados"}
            </small>
            <ol>
              {standings.slice(0, 4).map((standing) => (
                <li key={standing.pair.id}>
                  {pairName(standing.pair)} <b>{standing.points}</b>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <div className="dynamic-court-plan">
        {[semiOne, semiTwo].map((item) => (
          <div className="dynamic-court-card" key={item.label}>
            <span>{item.time} · {item.court}</span>
            <strong>{item.label}</strong>
            <p>{item.one ? pairName(item.one) : "Ganador Grupo"} vs {item.two ? pairName(item.two) : "Ganador Grupo"}</p>
          </div>
        ))}
        <div className="dynamic-court-card">
          <span>22:40 · Cancha 1</span>
          <strong>Final 4ta</strong>
          <p>{finalPairs.length === 2 ? `${pairName(finalPairs[0])} vs ${pairName(finalPairs[1])}` : "Se define con los ganadores de semifinal"}</p>
        </div>
        <div className="dynamic-court-card">
          <span>22:40 · Cancha 3</span>
          <strong>3er lugar 4ta</strong>
          <p>{thirdPlacePairs.length === 2 ? `${pairName(thirdPlacePairs[0])} vs ${pairName(thirdPlacePairs[1])}` : "Se define con los perdedores de semifinal"}</p>
        </div>
      </div>
      <div className="dynamic-actions">
        <button type="button" className="secondary-action" disabled={!canCreateSemis} onClick={createSemifinals}>
          Crear semifinales 22:15
        </button>
        <button type="button" className="secondary-action" disabled={!canCreateFinals} onClick={createFinals}>
          Crear final y 3er lugar 22:40
        </button>
      </div>
      <p className="muted">Desempate actual: puntos, partidos ganados, diferencia, juegos a favor y seed de inscripción.</p>
    </article>
  );
}

function FixturePreview({ matches, pairs, configuredCourts, resultForm, setResultForm, eventId, onChange, rentalMinutes, startTime }) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [turnFilter, setTurnFilter] = useState("all");

  const scheduledRows = matches
    .map((match) => {
      const schedule = parseFixtureRound(match.round_name);
      const one = pairs.find((pair) => pair.id === match.pair_one_id);
      const two = pairs.find((pair) => pair.id === match.pair_two_id);
      const category = fixtureCategoryFromPairs(one, two, schedule.category);
      return {
        category,
        court: match.court || "",
        courtLabel: normalizeCourt(match.court),
        done: hasResult(match),
        group: schedule.group,
        match,
        pairOne: one ? pairName(one) : `Pareja ${match.pair_one_id}`,
        pairTwo: two ? pairName(two) : `Pareja ${match.pair_two_id}`,
        time: schedule.time,
        turn: schedule.turn,
      };
    })
    .sort((a, b) => {
      const timeCompare = minutesFromSlot(a.time) - minutesFromSlot(b.time);
      if (timeCompare !== 0) return timeCompare;
      return String(a.court || "zz").localeCompare(String(b.court || "zz"), undefined, { numeric: true });
    });

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
