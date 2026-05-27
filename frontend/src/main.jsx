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
import { api } from "./api/client";
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
  description: "",
  is_active: true,
};

const emptyPlayer = { name: "", phone: "", category: "", preferred_side: "indiferente" };
const emptyPublicRegistration = {
  name: "",
  phone: "",
  gender: "hombre",
  category: "1era",
  preferred_side: "indiferente",
  partner_name: "",
  partner_phone: "",
  partner_preferred_side: "indiferente",
};
const emptyPublicResult = { round_name: "", match_id: "", pair_one_score: "", pair_two_score: "" };

const categoryOptions = {
  hombre: ["1era", "2da", "3ra", "4ta", "5ta", "6ta"],
  mujer: ["5taD+", "4taC+", "3raB+", "2daA+"],
};

function categoryLabel(category) {
  return category;
}

function pairName(pair) {
  const second = pair.player_two ? pair.player_two.name : "busca partner";
  return `${pair.player_one.name} / ${second}`;
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
  const [whatsapp, setWhatsapp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState("events");

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === Number(selectedEventId)),
    [events, selectedEventId],
  );

  async function loadBase() {
    const [dashboardData, eventsData, playersData] = await Promise.all([api.dashboard(), api.events(), api.players()]);
    setDashboard(dashboardData);
    setEvents(eventsData);
    setPlayers(playersData);
    if (!selectedEventId && eventsData[0]) setSelectedEventId(String(eventsData[0].id));
  }

  async function loadEventData(eventId = selectedEventId) {
    if (!eventId) return;
    const [pairData, paymentData, matchData, standingData, rankingData, whatsappData] = await Promise.all([
      api.pairs(eventId),
      api.payments(eventId),
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
    loadEventData(selectedEventId).catch((err) => setError(err.message));
  }, [selectedEventId]);

  async function submitEvent(event) {
    event.preventDefault();
    await run(async () => {
      const created = await api.createEvent({ ...eventForm, price: Number(eventForm.price), capacity: Number(eventForm.capacity) });
      setSelectedEventId(String(created.id));
      setEventForm(emptyEvent);
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
    await run(async () => {
      const category = categoryLabel(publicForm.category);
      const playerOne = await api.createPlayer({
        name: publicForm.name,
        phone: publicForm.phone || null,
        category,
        preferred_side: publicForm.preferred_side,
      });

      let playerTwo = null;
      if (publicForm.partner_name.trim()) {
        playerTwo = await api.createPlayer({
          name: publicForm.partner_name,
          phone: publicForm.partner_phone || null,
          category,
          preferred_side: publicForm.partner_preferred_side,
        });
      }

      await api.createPair(selectedEventId, {
        player_one_id: playerOne.id,
        player_two_id: playerTwo?.id || null,
        category,
        status: playerTwo ? "completa" : "buscando_partner",
      });

      setPublicForm(emptyPublicRegistration);
      setPage("events");
    });
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Padel Manager</p>
          <h1>Gestión de eventos</h1>
        </div>
        <div className="top-actions">
          <nav className="app-nav" aria-label="Secciones">
            <button className={page === "events" ? "active" : ""} onClick={() => setPage("events")}>Eventos</button>
            <button className={page === "register" ? "active" : ""} onClick={() => setPage("register")}>Registro</button>
            <button className={page === "results" ? "active" : ""} onClick={() => setPage("results")}>Resultados</button>
          </nav>
          <button className="icon-button" onClick={() => run(loadBase)} disabled={loading} title="Actualizar">
            <RefreshCw size={18} />
          </button>
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

      {page === "register" ? (
        <PublicRegistration
          events={events}
          selectedEventId={selectedEventId}
          setSelectedEventId={setSelectedEventId}
          selectedEvent={selectedEvent}
          form={publicForm}
          setForm={setPublicForm}
          onSubmit={submitPublicRegistration}
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
      ) : (
        <EventsPage
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
          run={run}
        />
      )}
    </main>
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
                <div className="data-block">
                  <h3><CalendarPlus size={16} /> Crear evento</h3>
                  <form onSubmit={submitEvent} className="event-form-grid">
                    <input placeholder="Nombre" value={eventForm.name} onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })} required />
                    <input type="date" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} required />
                    <input placeholder="Lugar" value={eventForm.place} onChange={(e) => setEventForm({ ...eventForm, place: e.target.value })} required />
                    <input placeholder="Categorías del evento" value={eventForm.categories} onChange={(e) => setEventForm({ ...eventForm, categories: e.target.value })} required />
                    <input type="number" placeholder="Precio" value={eventForm.price} onChange={(e) => setEventForm({ ...eventForm, price: e.target.value })} />
                    <input placeholder="Horario" value={eventForm.schedule} onChange={(e) => setEventForm({ ...eventForm, schedule: e.target.value })} required />
                    <input type="number" placeholder="Cupos" value={eventForm.capacity} onChange={(e) => setEventForm({ ...eventForm, capacity: e.target.value })} />
                    <input placeholder="Tipo torneo" value={eventForm.tournament_type} onChange={(e) => setEventForm({ ...eventForm, tournament_type: e.target.value })} required />
                    <textarea placeholder="Descripción" value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} />
                    <button><CalendarPlus size={16} /> Guardar evento</button>
                  </form>
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
                    {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                  </select>
                  <select value={pairForm.player_two_id} onChange={(e) => setPairForm({ ...pairForm, player_two_id: e.target.value })}>
                    <option value="">Jugador 2 opcional</option>
                    {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
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
                  <PairsBlock pairs={pairs} players={players} eventId={selectedEventId} onChange={run} />
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
                <TournamentBracket matches={matches} pairs={pairs} />
              </div>
            </div>
            )}

            {eventTab === "payments" && (
              <div className="payments-grid">
                <PaymentBlock payments={payments} pairs={pairs} eventId={selectedEventId} onChange={run} />
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
          <p className="empty">Crea o selecciona un evento para comenzar.</p>
        )}
      </section>
    </section>
  );
}

function PublicRegistration({ events, selectedEventId, setSelectedEventId, selectedEvent, form, setForm, onSubmit }) {
  const options = categoryOptions[form.gender];

  return (
    <section className="public-page">
      <div className="public-hero">
        <p className="eyebrow">Registro jugadores</p>
        <h2>Inscripción con o sin partner</h2>
        <p>Los jugadores completan sus datos, eligen categoría y quedan inscritos como pareja completa o buscando partner.</p>
      </div>

      <div className="public-grid">
        <aside className="panel">
          <h2><ExternalLink size={18} /> Evento disponible</h2>
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
          <h2><UserPlus size={18} /> Formulario de inscripción</h2>
          <form onSubmit={onSubmit} className="registration-form">
            <input placeholder="Nombre jugador" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input placeholder="Teléfono opcional" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <div className="segmented">
              <button type="button" className={form.gender === "hombre" ? "active" : ""} onClick={() => setForm({ ...form, gender: "hombre", category: "1era" })}>Hombre</button>
              <button type="button" className={form.gender === "mujer" ? "active" : ""} onClick={() => setForm({ ...form, gender: "mujer", category: "5taD+" })}>Mujer</button>
            </div>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {options.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <select value={form.preferred_side} onChange={(e) => setForm({ ...form, preferred_side: e.target.value })}>
              <option value="drive">Drive</option>
              <option value="reves">Revés</option>
              <option value="indiferente">Indiferente</option>
            </select>

            <div className="form-divider">Partner opcional</div>
            <input placeholder="Nombre partner" value={form.partner_name} onChange={(e) => setForm({ ...form, partner_name: e.target.value })} />
            <input placeholder="Teléfono partner opcional" value={form.partner_phone} onChange={(e) => setForm({ ...form, partner_phone: e.target.value })} />
            <select value={form.partner_preferred_side} onChange={(e) => setForm({ ...form, partner_preferred_side: e.target.value })}>
              <option value="drive">Drive</option>
              <option value="reves">Revés</option>
              <option value="indiferente">Indiferente</option>
            </select>
            <button disabled={!selectedEventId}><UserPlus size={16} /> Inscribirme</button>
          </form>
        </section>
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

function PaymentBlock({ payments, pairs, eventId, onChange }) {
  return (
    <article className="data-block">
      <h3><CreditCard size={16} /> Pagos</h3>
      {payments.map((payment) => {
        const pair = pairs.find((item) => item.id === payment.pair_id);
        return (
          <div className="payment-row" key={payment.id}>
            <span>{pair ? pairName(pair) : `Pareja ${payment.pair_id}`}</span>
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
  return String(court).startsWith("Cancha") ? String(court) : `Cancha ${court}`;
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

function FixturePreview({ matches, pairs, configuredCourts, resultForm, setResultForm, eventId, onChange, rentalMinutes, startTime }) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [turnFilter, setTurnFilter] = useState("all");
  const configuredCourtNames = (configuredCourts || "")
    .split(",")
    .map((court) => court.trim())
    .filter(Boolean);

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
  const courtNames = [...new Set([
    ...configuredCourtNames,
    ...scheduledRows.map((row) => row.court).filter(Boolean),
  ])].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
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
