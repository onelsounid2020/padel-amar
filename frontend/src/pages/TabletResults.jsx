import React, { useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, RotateCcw } from "lucide-react";

import { api } from "../api/client";
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

const padelScorePresets = [
  [6, 0],
  [6, 1],
  [6, 2],
  [6, 3],
  [6, 4],
  [7, 5],
  [7, 6],
];

function scoreState(current) {
  const one = current?.pair_one_score;
  const two = current?.pair_two_score;
  if (one === "" || two === "" || one === undefined || two === undefined) {
    return { tone: "pending", label: "Sin marcador" };
  }
  const left = Number(one);
  const right = Number(two);
  if (Number.isNaN(left) || Number.isNaN(right)) return { tone: "warning", label: "Revisa números" };
  if (left === right) return { tone: "warning", label: "Empate" };
  if (Math.max(left, right) > 9) return { tone: "warning", label: "Marcador alto" };
  if (Math.max(left, right) < 6) return { tone: "warning", label: "Marcador corto" };
  return { tone: "ok", label: left > right ? "Gana pareja 1" : "Gana pareja 2" };
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
  const [turnFilter, setTurnFilter] = useState("next");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [scores, setScores] = useState({});
  const [winnerSide, setWinnerSide] = useState({});
  const [confirmingMatchId, setConfirmingMatchId] = useState(null);

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
        pair_one_score: normalizeScore(match.pair_one_score),
        pair_two_score: normalizeScore(match.pair_two_score),
      },
    ])));
  }, [matches]);

  const categories = [...new Set(matchRows.map((row) => row.category))];
  const turns = [...new Set(matchRows.map((row) => row.time || row.turn))];
  const nextTurn = turns.find((turn) => matchRows.some((row) => (row.time || row.turn) === turn && !row.done)) || turns[0] || "";
  const activeTurn = turnFilter === "next" ? nextTurn : turnFilter;
  const completedCount = matchRows.filter((row) => row.done).length;
  const pendingCount = matchRows.length - completedCount;
  const conflictCount = resultSubmissions.filter((submission) => submission.status === "conflicto").length;
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
    setConfirmingMatchId(null);
  }

  function bumpScore(matchId, field, amount) {
    const currentValue = Number(scores[matchId]?.[field] || 0);
    setScore(matchId, field, currentValue + amount);
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
    setConfirmingMatchId(null);
  }

  function resetMatchScore(row) {
    setScores((current) => ({
      ...current,
      [row.match.id]: {
        pair_one_score: normalizeScore(row.match.pair_one_score),
        pair_two_score: normalizeScore(row.match.pair_two_score),
      },
    }));
    setConfirmingMatchId(null);
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
        <span>{completedCount}/{matchRows.length} cargados · {pendingCount} pendientes{hasUnsavedScores ? " · cambios sin guardar" : ""}</span>
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

      {conflictCount > 0 && (
        <div className="fixture-collision-alert tablet-conflict-alert">
          <strong>{conflictCount} conflicto{conflictCount === 1 ? "" : "s"} de resultado</strong>
          <span>Hay marcadores reportados por jugadores que no coinciden. Revisa el partido antes de guardar el resultado oficial.</span>
        </div>
      )}

      <div className="tablet-match-grid">
        {visibleRows.length ? visibleRows.map((row) => {
          const current = scores[row.match.id] || { pair_one_score: "", pair_two_score: "" };
          const canSave = selectedEventId && current.pair_one_score !== "" && current.pair_two_score !== "";
          const isDirty = normalizeScore(current.pair_one_score) !== normalizeScore(row.match.pair_one_score)
            || normalizeScore(current.pair_two_score) !== normalizeScore(row.match.pair_two_score);
          const state = scoreState(current);
          const selectedWinner = winnerSide[row.match.id] || (Number(current.pair_two_score || 0) > Number(current.pair_one_score || 0) ? "two" : "one");
          const isConfirming = confirmingMatchId === row.match.id;
          return (
            <article className={`tablet-match ${row.done ? "done" : ""} ${isDirty ? "dirty" : ""}`} key={row.match.id}>
              <div className="tablet-match-head">
                <span>{row.time || row.turn}</span>
                <strong>{row.courtLabel}</strong>
                <em>{row.category}{row.group ? ` · ${row.group}` : ""}</em>
              </div>
              <div className="tablet-scoreboard">
                <div className={`tablet-team ${Number(current.pair_one_score || 0) > Number(current.pair_two_score || 0) ? "leading" : ""}`}>
                  <strong>{row.pairOne}</strong>
                  <div className="tablet-score-control">
                    <button type="button" aria-label="Restar punto pareja 1" onClick={() => bumpScore(row.match.id, "pair_one_score", -1)}>-</button>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={current.pair_one_score}
                      onChange={(event) => setScore(row.match.id, "pair_one_score", event.target.value)}
                    />
                    <button type="button" aria-label="Sumar punto pareja 1" onClick={() => bumpScore(row.match.id, "pair_one_score", 1)}>+</button>
                  </div>
                </div>
                <div className="tablet-score-divider">
                  <span>{current.pair_one_score || 0}</span>
                  <em>-</em>
                  <span>{current.pair_two_score || 0}</span>
                </div>
                <div className={`tablet-team ${Number(current.pair_two_score || 0) > Number(current.pair_one_score || 0) ? "leading" : ""}`}>
                  <strong>{row.pairTwo}</strong>
                  <div className="tablet-score-control">
                    <button type="button" aria-label="Restar punto pareja 2" onClick={() => bumpScore(row.match.id, "pair_two_score", -1)}>-</button>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={current.pair_two_score}
                      onChange={(event) => setScore(row.match.id, "pair_two_score", event.target.value)}
                    />
                    <button type="button" aria-label="Sumar punto pareja 2" onClick={() => bumpScore(row.match.id, "pair_two_score", 1)}>+</button>
                  </div>
                </div>
              </div>
              <div className="tablet-winner-toggle" aria-label="Ganador para marcadores rápidos">
                <button
                  type="button"
                  className={selectedWinner === "one" ? "active" : ""}
                  onClick={() => setWinnerSide((currentWinner) => ({ ...currentWinner, [row.match.id]: "one" }))}
                >
                  Gana 1
                </button>
                <button
                  type="button"
                  className={selectedWinner === "two" ? "active" : ""}
                  onClick={() => setWinnerSide((currentWinner) => ({ ...currentWinner, [row.match.id]: "two" }))}
                >
                  Gana 2
                </button>
              </div>
              <div className="tablet-presets" aria-label="Marcadores rápidos">
                {padelScorePresets.map(([winnerScore, loserScore]) => (
                  <button
                    type="button"
                    key={`${winnerScore}-${loserScore}`}
                    onClick={() => applyPreset(row.match.id, selectedWinner, winnerScore, loserScore)}
                  >
                    {selectedWinner === "one" ? `${winnerScore}-${loserScore}` : `${loserScore}-${winnerScore}`}
                  </button>
                ))}
              </div>
              <div className={`tablet-score-state ${state.tone}`}>
                <span>{state.label}</span>
                {isDirty && (
                  <button type="button" onClick={() => resetMatchScore(row)} title="Deshacer cambios">
                    <RotateCcw size={14} /> Deshacer
                  </button>
                )}
              </div>
              {isConfirming ? (
                <div className="tablet-confirm-save">
                  <span>Confirmar {current.pair_one_score || 0}-{current.pair_two_score || 0}</span>
                  <button type="button" className="secondary-action" onClick={() => setConfirmingMatchId(null)}>Cancelar</button>
                  <button type="button" disabled={!canSave || loading} onClick={() => saveMatch(row.match.id)}>
                    <Check size={16} /> Confirmar
                  </button>
                </div>
              ) : (
                <button className="tablet-save" type="button" disabled={!canSave || loading} onClick={() => setConfirmingMatchId(row.match.id)}>
                  <Check size={16} /> {isDirty ? "Guardar" : row.done ? "Confirmar edición" : "Guardar"}
                </button>
              )}
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
