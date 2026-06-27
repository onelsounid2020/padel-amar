import React, { useEffect, useMemo, useState } from "react";
import { Check, Medal, RefreshCw, RotateCcw, Save, Trophy } from "lucide-react";

import { api } from "../api/client";
import { computeFinalPlans, computeFinalRanking, computeRankingPlacementFixture } from "../lib/fixtureFinals";
import { pairName } from "../lib/pairs";

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

function fixtureRoundInfo(roundName, fallbackIndex = 0) {
  const value = roundName || "";
  const match = value.match(/ronda\s*(\d+)/i) || value.match(/(?:partido|r)\s*(\d+)/i);
  const number = match ? Number(match[1]) : fallbackIndex + 1;
  return {
    key: `round-${number}`,
    label: `Ronda ${number}`,
    number,
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

function fixtureCategoryFromPairs(pairOne, pairTwo, fallbackCategory) {
  if (pairOne?.category && pairTwo?.category) {
    return pairOne.category === pairTwo.category ? pairOne.category : `${pairOne.category} / ${pairTwo.category}`;
  }
  return fallbackCategory;
}

function normalizeScore(value) {
  return value === null || value === undefined ? "" : String(value);
}

function shortenPairName(fullName) {
  return String(fullName || "")
    .split(" / ")
    .map((part) => part.trim().split(/\s+/).slice(0, 2).join(" "))
    .join(" / ");
}

const padelScorePresets = [
  [6, 0],
  [6, 1],
  [6, 2],
  [6, 3],
  [6, 4],
  [7, 5],
  [7, 6],
];

const tiebreakScorePresets = [
  [7, 0],
  [7, 2],
  [7, 4],
  [7, 5],
  [8, 6],
  [9, 7],
];

function scoreState(current, isTiebreak = false) {
  const one = current?.pair_one_score;
  const two = current?.pair_two_score;
  if (one === "" || two === "" || one === undefined || two === undefined) {
    return { tone: "pending", label: "Sin marcador" };
  }
  const left = Number(one);
  const right = Number(two);
  if (Number.isNaN(left) || Number.isNaN(right)) return { tone: "warning", label: "Revisa números" };
  if (left === right) return { tone: "warning", label: "Empate" };
  if (isTiebreak) {
    const winner = Math.max(left, right);
    const loser = Math.min(left, right);
    if (winner < 7 || winner - loser < 2) return { tone: "warning", label: "Tiebreak incompleto" };
    return { tone: "ok", label: left > right ? "Gana pareja 1" : "Gana pareja 2" };
  }
  if (Math.max(left, right) > 9) return { tone: "warning", label: "Marcador alto" };
  if (Math.max(left, right) < 6) return { tone: "warning", label: "Marcador corto" };
  return { tone: "ok", label: left > right ? "Gana pareja 1" : "Gana pareja 2" };
}

function finalFixtureMatchLabel(roundName) {
  if (/Final oro y plata/i.test(roundName || "")) return "Oro y plata";
  if (/Partido por bronce/i.test(roundName || "")) return "Bronce";
  const match = (roundName || "").match(/Definición puestos\s+(\d+)\s+y\s+(\d+)/i);
  return match ? `Puestos ${match[1]} y ${match[2]}` : "Definición";
}

function applyFinalMatchFormat(match, format) {
  if (format !== "tiebreak") return match;
  const timeMatch = match.round_name.match(/\s-\s(\d{1,2}:\d{2}-\d{1,2}:\d{2})$/);
  return {
    ...match,
    round_name: timeMatch
      ? match.round_name.replace(timeMatch[0], ` - Tiebreak a 7 - ${timeMatch[1]}`)
      : `${match.round_name} - Tiebreak a 7`,
  };
}

export function TabletResults({
  events,
  pairs,
  matches,
  resultSubmissions = [],
  standings,
  selectedEventId,
  setSelectedEventId,
  selectedEvent,
  onSave,
  loading,
  onRefresh,
}) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [roundFilter, setRoundFilter] = useState("next");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [scores, setScores] = useState({});
  const [winnerSide, setWinnerSide] = useState({});
  const [activeTabletTab, setActiveTabletTab] = useState("scores");
  const [finalMatchFormat, setFinalMatchFormat] = useState("normal");

  const pairById = useMemo(() => new Map(pairs.map((pair) => [pair.id, pair])), [pairs]);
  const matchRows = useMemo(() => matches
    .map((match, index) => {
      const schedule = parseFixtureRound(match.round_name);
      const round = fixtureRoundInfo(match.round_name, index);
      const one = pairById.get(match.pair_one_id);
      const two = pairById.get(match.pair_two_id);
      const category = fixtureCategoryFromPairs(one, two, schedule.category);
      return {
        category,
        courtLabel: normalizeCourt(match.court),
        done: hasResult(match),
        group: schedule.group,
        isTiebreak: /Tiebreak a 7/i.test(match.round_name || ""),
        match,
        pairOne: one ? pairName(one) : `Pareja ${match.pair_one_id}`,
        pairTwo: two ? pairName(two) : `Pareja ${match.pair_two_id}`,
        roundKey: round.key,
        roundLabel: round.label,
        roundNumber: round.number,
        time: schedule.time,
        turn: schedule.turn,
      };
    })
    .sort((a, b) => {
      if (a.roundNumber !== b.roundNumber) return a.roundNumber - b.roundNumber;
      const timeCompare = minutesFromSlot(a.time || a.turn) - minutesFromSlot(b.time || b.turn);
      if (timeCompare !== 0) return timeCompare;
      return a.courtLabel.localeCompare(b.courtLabel, undefined, { numeric: true });
    }), [matches, pairById]);

  useEffect(() => {
    setScores(Object.fromEntries(matches.map((match) => [
      match.id,
      {
        pair_one_score: normalizeScore(match.pair_one_score),
        pair_two_score: normalizeScore(match.pair_two_score),
      },
    ])));
  }, [matches]);

  const categories = [...new Set(matchRows.map((row) => row.category))];
  const rounds = [...new Map(matchRows.map((row) => [row.roundKey, { key: row.roundKey, label: row.roundLabel, number: row.roundNumber }])).values()]
    .sort((left, right) => left.number - right.number);
  const nextRound = rounds.find((round) => matchRows.some((row) => row.roundKey === round.key && !row.done))?.key || rounds[0]?.key || "";
  const activeRound = roundFilter === "next" ? nextRound : roundFilter;
  const completedCount = matchRows.filter((row) => row.done).length;
  const pendingCount = matchRows.length - completedCount;
  const conflictCount = resultSubmissions.filter((submission) => submission.status === "conflicto").length;
  const standingsByCategory = standings.reduce((groups, standing) => {
    const category = standing.pair.category || "Sin categoria";
    groups[category] = [...(groups[category] || []), standing];
    return groups;
  }, {});
  const dynamicFinalPlans = useMemo(() => {
    const fixtureConfig = selectedEvent?.fixture_config || {};
    return computeFinalPlans({ pairs, matches, standings, fixtureConfig });
  }, [pairs, matches, standings, selectedEvent?.fixture_config]);
  const placementFinalPlans = useMemo(() => computeRankingPlacementFixture({
    pairs,
    matches,
    standings,
    fixtureConfig: selectedEvent?.fixture_config || {},
  }), [pairs, matches, standings, selectedEvent?.fixture_config]);
  const finalRanking = useMemo(() => computeFinalRanking({ pairs, matches }), [pairs, matches]);

  const effectiveStatusFilter = statusFilter === "pending" && pendingCount === 0 ? "all" : statusFilter;
  const visibleRows = matchRows.filter((row) => (
    (categoryFilter === "all" || row.category === categoryFilter)
    && (!activeRound || row.roundKey === activeRound)
    && (effectiveStatusFilter === "all" || (effectiveStatusFilter === "pending" ? !row.done : row.done))
  ));
  const hasUnsavedScores = matchRows.some((row) => {
    const current = scores[row.match.id] || {};
    return normalizeScore(current.pair_one_score) !== normalizeScore(row.match.pair_one_score)
      || normalizeScore(current.pair_two_score) !== normalizeScore(row.match.pair_two_score);
  });

  useEffect(() => {
    if (hasUnsavedScores || loading) return undefined;
    const interval = window.setInterval(() => {
      onRefresh();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [hasUnsavedScores, loading, onRefresh]);

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

  function applyPreset(matchId, winner, winnerScore, loserScore) {
    setWinnerSide((current) => ({ ...current, [matchId]: winner }));
    setScores((current) => ({
      ...current,
      [matchId]: {
        pair_one_score: String(winner === "one" ? winnerScore : loserScore),
        pair_two_score: String(winner === "two" ? winnerScore : loserScore),
      },
    }));
  }

  function resetMatchScore(row) {
    setScores((current) => ({
      ...current,
      [row.match.id]: {
        pair_one_score: normalizeScore(row.match.pair_one_score),
        pair_two_score: normalizeScore(row.match.pair_two_score),
      },
    }));
  }

  function saveMatch(matchId) {
    const current = scores[matchId] || {};
    return onSave(() => api.registerResult(selectedEventId, matchId, {
      pair_one_score: Number(current.pair_one_score),
      pair_two_score: Number(current.pair_two_score),
    }));
  }

  function createDynamicMatches(payload) {
    return onSave(() => api.createMatchesBulk(selectedEventId, payload, false));
  }

  function createPlacementFinalMatches(payload) {
    const formattedPayload = payload.map((match) => applyFinalMatchFormat(match, finalMatchFormat));
    return createDynamicMatches(formattedPayload);
  }

  const proposedPlacementMatches = placementFinalPlans.flatMap((plan) => plan.proposedMatches);
  const existingPlacementMatches = placementFinalPlans.flatMap((plan) => plan.existingMatches);
  const allPlacementReady = placementFinalPlans.length > 0 && placementFinalPlans.every((plan) => plan.ready || plan.existingMatches.length);
  const finalRankingReadyCount = finalRanking.filter((category) => category.ready).length;

  return (
    <section className="tablet-page">
      <div className="tablet-top">
        <strong>{selectedEvent ? selectedEvent.name : "Mesa de resultados"}</strong>
        <span>{completedCount}/{matchRows.length} cargados · {pendingCount} pendientes{hasUnsavedScores ? " · cambios sin guardar" : ""}</span>
        <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>
          <option value="">Evento</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
        </select>
        <button type="button" className="tablet-refresh" onClick={onRefresh} disabled={loading} title="Actualizar">
          <RefreshCw size={18} />
        </button>
      </div>

      <nav className="tablet-mode-tabs" aria-label="Secciones de tablet">
        <button type="button" className={activeTabletTab === "scores" ? "active" : ""} onClick={() => setActiveTabletTab("scores")}>
          <Check size={16} /> Marcadores <span>{pendingCount}</span>
        </button>
        <button type="button" className={activeTabletTab === "ranking" ? "active" : ""} onClick={() => setActiveTabletTab("ranking")}>
          <Medal size={16} /> Ranking <span>{Object.keys(standingsByCategory).length}</span>
        </button>
        <button type="button" className={activeTabletTab === "finals" ? "active" : ""} onClick={() => setActiveTabletTab("finals")}>
          <Trophy size={16} /> Finales <span>{proposedPlacementMatches.length || finalRanking.reduce((sum, item) => sum + item.totalMatches, 0)}</span>
        </button>
      </nav>

      {activeTabletTab === "scores" && <div className="tablet-controls">
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">Todas las categorías</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)}>
          <option value="next">Próxima ronda pendiente</option>
          {rounds.map((round) => <option key={round.key} value={round.key}>{round.label}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="pending">Pendientes</option>
          <option value="done">Cargados</option>
          <option value="all">Todos</option>
        </select>
      </div>}

      {conflictCount > 0 && (
        <div className="fixture-collision-alert tablet-conflict-alert">
          <strong>{conflictCount} conflicto{conflictCount === 1 ? "" : "s"} de resultado</strong>
          <span>Hay marcadores reportados por jugadores que no coinciden. Revisa el partido antes de guardar el resultado oficial.</span>
        </div>
      )}

      {activeTabletTab === "scores" && <div className="tablet-match-grid">
        {visibleRows.length ? visibleRows.map((row) => {
          const current = scores[row.match.id] || { pair_one_score: "", pair_two_score: "" };
          const canSave = selectedEventId && current.pair_one_score !== "" && current.pair_two_score !== "";
          const isDirty = normalizeScore(current.pair_one_score) !== normalizeScore(row.match.pair_one_score)
            || normalizeScore(current.pair_two_score) !== normalizeScore(row.match.pair_two_score);
          const state = scoreState(current, row.isTiebreak);
          const scorePresets = row.isTiebreak ? tiebreakScorePresets : padelScorePresets;
          const selectedWinner = winnerSide[row.match.id] || (Number(current.pair_two_score || 0) > Number(current.pair_one_score || 0) ? "two" : "one");
          return (
            <article className={`tablet-match ${row.done ? "done" : ""} ${isDirty ? "dirty" : ""}`} key={row.match.id}>
              <div className="tablet-match-head">
                <span>{row.time || row.turn}</span>
                <strong>{row.courtLabel}</strong>
                <em>{row.category}{row.group ? ` · ${row.group}` : ""}{row.isTiebreak ? " · Tiebreak a 7" : ""}</em>
              </div>
              <div className="tablet-winner-pick" aria-label="Seleccionar dupla ganadora">
                <button
                  type="button"
                  className={selectedWinner === "one" ? "active" : ""}
                  onClick={() => setWinnerSide((currentWinner) => ({ ...currentWinner, [row.match.id]: "one" }))}
                >
                  <span>1</span>
                  <strong title={row.pairOne}>{shortenPairName(row.pairOne)}</strong>
                </button>
                <button
                  type="button"
                  className={selectedWinner === "two" ? "active" : ""}
                  onClick={() => setWinnerSide((currentWinner) => ({ ...currentWinner, [row.match.id]: "two" }))}
                >
                  <span>2</span>
                  <strong title={row.pairTwo}>{shortenPairName(row.pairTwo)}</strong>
                </button>
              </div>
              <div className="tablet-presets" aria-label="Marcadores rápidos">
                {scorePresets.map(([winnerScore, loserScore]) => (
                  <button
                    type="button"
                    key={`${winnerScore}-${loserScore}`}
                    onClick={() => applyPreset(row.match.id, selectedWinner, winnerScore, loserScore)}
                  >
                    {selectedWinner === "one" ? `${winnerScore}-${loserScore}` : `${loserScore}-${winnerScore}`}
                  </button>
                ))}
              </div>
              <div className="tablet-manual-score">
                <span>Otro resultado</span>
                <input
                  aria-label={`Puntaje ${row.pairOne}`}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={current.pair_one_score}
                  onChange={(event) => setScore(row.match.id, "pair_one_score", event.target.value)}
                />
                <b>-</b>
                <input
                  aria-label={`Puntaje ${row.pairTwo}`}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={current.pair_two_score}
                  onChange={(event) => setScore(row.match.id, "pair_two_score", event.target.value)}
                />
              </div>
              <div className={`tablet-score-state ${state.tone}`}>
                <span>{state.label}</span>
                {isDirty && (
                  <button type="button" onClick={() => resetMatchScore(row)} title="Deshacer cambios">
                    <RotateCcw size={14} /> Deshacer
                  </button>
                )}
              </div>
              <button className="tablet-save" type="button" disabled={!canSave || loading || !isDirty} onClick={() => saveMatch(row.match.id)}>
                <Check size={16} /> {row.done ? "Guardar corrección" : "Guardar resultado"}
              </button>
            </article>
          );
        }) : (
          <div className="tablet-empty">No hay partidos con esos filtros.</div>
        )}
      </div>}

      {activeTabletTab === "ranking" && (
        <section className="tablet-ranking-full" aria-label="Ranking completo">
          {Object.entries(standingsByCategory).length ? Object.entries(standingsByCategory).map(([category, categoryStandings]) => (
            <article key={category}>
              <header>
                <div><strong>{category}</strong><small>Ranking oficial</small></div>
                <span>{categoryStandings.length} parejas</span>
              </header>
              <div className="tablet-ranking-table">
                <div className="tablet-ranking-row tablet-ranking-header-row">
                  <span>#</span>
                  <strong>Dupla</strong>
                  <small>Detalle oficial</small>
                  <b>PTS</b>
                </div>
                {categoryStandings.map((standing) => {
                  const draw = standing.played - standing.won - standing.lost;
                  const difference = standing.points_for - standing.points_against;
                  const tiedByPoints = categoryStandings.filter((item) => item.points === standing.points).length > 1;
                  return (
                    <div className={`tablet-ranking-row position-${standing.position} ${tiedByPoints ? "tied" : ""}`} key={standing.id}>
                      <span>{standing.position}</span>
                      <strong>{pairName(standing.pair)}</strong>
                      <small>
                        <em>J {standing.played}</em>
                        <em>G {standing.won}</em>
                        <em>E {draw}</em>
                        <em>P {standing.lost}</em>
                        <em>PF {standing.points_for}</em>
                        <em>PC {standing.points_against}</em>
                        <em>DIF {difference > 0 ? "+" : ""}{difference}</em>
                        {tiedByPoints && <i>desempate</i>}
                      </small>
                      <b>{standing.points}</b>
                    </div>
                  );
                })}
              </div>
            </article>
          )) : <div className="tablet-empty">El ranking aparecerá cuando existan resultados.</div>}
        </section>
      )}

      {activeTabletTab === "finals" && (
        <section className="tablet-finals-workspace" aria-label="Gestión de finales">
          <div className="tablet-final-hero">
            <div>
              <span>Control de cierre</span>
              <strong>Finales y medallas</strong>
              <small>Revisa los cruces decisivos, crea la quinta ronda y confirma el ranking final desde la tablet.</small>
            </div>
            <div className="tablet-final-hero-metrics">
              <span><b>{existingPlacementMatches.length || proposedPlacementMatches.length}</b> cruces</span>
              <span><b>{placementFinalPlans.length}</b> categorías</span>
              <span><b>{finalRankingReadyCount}</b> rankings listos</span>
            </div>
          </div>

          <article className="tablet-final-card primary tablet-placement-card">
            <header>
              <div><strong>Quinta ronda por posiciones</strong><span>{proposedPlacementMatches.length ? `${proposedPlacementMatches.length} partidos listos para crear` : existingPlacementMatches.length ? "Fixture final generado" : "Sin propuesta nueva"}</span></div>
              {proposedPlacementMatches.length > 0 && (
                <select value={finalMatchFormat} onChange={(event) => setFinalMatchFormat(event.target.value)}>
                  <option value="normal">Partido normal</option>
                  <option value="tiebreak">Tiebreak a 7</option>
                </select>
              )}
            </header>
            <div className="tablet-final-plans">
              {placementFinalPlans.map((plan) => {
                const previewMatches = plan.existingMatches.length ? plan.existingMatches : plan.proposedMatches.map((match) => applyFinalMatchFormat(match, finalMatchFormat));
                return (
                  <section key={plan.category} className={plan.ready || plan.existingMatches.length ? "ready" : "blocked"}>
                    <div><strong>{plan.category}</strong><span>{plan.existingMatches.length ? "Generada" : plan.reason || `${plan.slot} · ${plan.requiredCourts} canchas`}</span></div>
                    {previewMatches.map((match) => {
                      const one = pairById.get(match.pair_one_id);
                      const two = pairById.get(match.pair_two_id);
                      return (
                        <article className="tablet-placement-match" key={`${match.round_name}-${match.court}`}>
                          <b>{match.court}</b>
                          <div>
                            <strong>{finalFixtureMatchLabel(match.round_name)}</strong>
                            <span>{one ? pairName(one) : match.pair_one_id} vs {two ? pairName(two) : match.pair_two_id}</span>
                          </div>
                          {/Tiebreak a 7/i.test(match.round_name || "") && <em>TB7</em>}
                        </article>
                      );
                    })}
                  </section>
                );
              })}
            </div>
            {proposedPlacementMatches.length > 0 ? (
              <button type="button" disabled={!allPlacementReady || loading} onClick={() => createPlacementFinalMatches(proposedPlacementMatches)}>
                <Save size={16} /> Crear quinta ronda
              </button>
            ) : (
              <div className="tablet-final-ready-banner"><Trophy size={18} /> Ronda final lista para cargar resultados</div>
            )}
          </article>

          <article className="tablet-final-card">
            <header><div><strong>Semifinales y finales dinámicas</strong><span>Para formatos de 4, 8 o 16 parejas</span></div></header>
            {dynamicFinalPlans.length ? dynamicFinalPlans.map((plan) => (
              <section className="tablet-dynamic-plan" key={plan.category}>
                <div><strong>{plan.category}</strong><span>{plan.finishedGroupMatches}/{plan.totalGroupMatches} fase</span></div>
                <p>{plan.type === "placements" ? "Finales por posición entre grupos" : plan.semis?.length ? "Semifinales listas" : plan.finals?.length ? "Final y 3er lugar listos" : "Esperando resultados"}</p>
                <div className="tablet-dynamic-actions">
                  <button type="button" disabled={!((plan.type === "placements" ? plan.placementMatches?.length : plan.semis?.length)) || loading} onClick={() => createDynamicMatches(plan.type === "placements" ? plan.placementMatches : plan.semis)}>Crear R4</button>
                  <button type="button" disabled={!plan.finals?.length || loading} onClick={() => createDynamicMatches(plan.finals)}>Crear R5</button>
                </div>
              </section>
            )) : <span className="tablet-muted">No hay finales dinámicas pendientes.</span>}
          </article>

          {finalRanking.length > 0 && (
            <article className="tablet-final-card tablet-medal-card">
              <header><div><strong>Ranking final</strong><span>Después de cerrar la quinta ronda</span></div></header>
              <div className="tablet-final-ranking">
                {finalRanking.map((category) => (
                  <section key={category.category}>
                    <strong>{category.category}</strong>
                    {category.ready ? category.placements.slice(0, 4).map((placement) => (
                      <span className={`medal-position-${placement.position}`} key={placement.position}>
                        <b>{placement.position === 1 ? "Oro" : placement.position === 2 ? "Plata" : placement.position === 3 ? "Bronce" : "4°"}</b>
                        {pairName(placement.pair)}
                      </span>
                    )) : <span>{category.completedMatches}/{category.totalMatches} cerrados</span>}
                  </section>
                ))}
              </div>
            </article>
          )}
        </section>
      )}

    </section>
  );
}
