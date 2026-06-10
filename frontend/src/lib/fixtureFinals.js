export function parseFixtureRound(roundName) {
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

export function hasResult(match) {
  return match.pair_one_score !== null && match.pair_one_score !== undefined
    && match.pair_two_score !== null && match.pair_two_score !== undefined;
}

export function minutesFromSlot(slot) {
  const start = (slot || "").split("-")[0];
  const [hours, minutes] = start.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 9999;
  return (hours * 60) + minutes;
}

export function slotEndMinutes(slot) {
  const end = (slot || "").split("-")[1];
  const [hours, minutes] = (end || "").split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return (hours * 60) + minutes;
}

export function minutesToTime(totalMinutes) {
  const minutesInDay = 24 * 60;
  const normalized = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function playoffSlotLabel(startMinutes, setMinutes, offset = 0) {
  const start = startMinutes + (offset * Number(setMinutes || 20));
  const end = start + Number(setMinutes || 20);
  return `${minutesToTime(start)}-${minutesToTime(end)}`;
}

export function fixtureCategoryFromPairs(pairOne, pairTwo, fallbackCategory) {
  if (pairOne?.category && pairTwo?.category) {
    return pairOne.category === pairTwo.category ? pairOne.category : `${pairOne.category} / ${pairTwo.category}`;
  }
  return fallbackCategory;
}

export function categoryPairGroups(pairs) {
  return pairs
    .filter((pair) => pair.status === "completa" && pair.player_two_id)
    .reduce((groups, pair) => {
      groups[pair.category] = [...(groups[pair.category] || []), pair];
      return groups;
    }, {});
}

export function resolveMatchResult(match) {
  if (!match || !hasResult(match)) return { winnerId: null, loserId: null };
  const oneScore = Number(match.pair_one_score);
  const twoScore = Number(match.pair_two_score);
  if (oneScore === twoScore) return { winnerId: null, loserId: null };
  return oneScore > twoScore
    ? { winnerId: match.pair_one_id, loserId: match.pair_two_id }
    : { winnerId: match.pair_two_id, loserId: match.pair_one_id };
}

export function computeFourPairFinalPlans({ pairs, matches, standings, fixtureConfig = {} }) {
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
  const groups = categoryPairGroups(pairs);
  const setMinutes = Number(fixtureConfig.set_minutes || 20);
  const fallbackStart = fixtureConfig.start_time || "21:10";

  const matchRows = matches.map((match) => {
    const schedule = parseFixtureRound(match.round_name);
    const pairOne = pairById.get(match.pair_one_id);
    const pairTwo = pairById.get(match.pair_two_id);
    const category = fixtureCategoryFromPairs(pairOne, pairTwo, schedule.category);
    return { match, schedule, pairOne, pairTwo, category, done: hasResult(match) };
  });

  const standingsByCategory = standings.reduce((collection, standing) => {
    const category = standing.pair?.category || pairById.get(standing.pair_id)?.category || "Sin categoria";
    collection[category] = [...(collection[category] || []), standing];
    return collection;
  }, {});

  return Object.entries(groups)
    .filter(([, categoryPairs]) => categoryPairs.length === 4)
    .map(([category, categoryPairs]) => {
      const categoryRows = matchRows.filter((row) => row.category === category);
      const groupRows = categoryRows.filter((row) => !/fase final|torneo|semifinal|final|3er lugar/i.test(row.match.round_name || ""));
      const totalGroupMatches = (categoryPairs.length * (categoryPairs.length - 1)) / 2;
      const standingsRows = [...(standingsByCategory[category] || [])].sort((a, b) => a.position - b.position);
      const existingSemiOne = categoryRows.find((row) => /semifinal 1/i.test(row.match.round_name || ""))?.match;
      const existingSemiTwo = categoryRows.find((row) => /semifinal 2/i.test(row.match.round_name || ""))?.match;
      const existingFinal = categoryRows.find((row) => /\bfinal\b/i.test(row.match.round_name || "") && !/semifinal/i.test(row.match.round_name || ""))?.match;
      const existingThirdPlace = categoryRows.find((row) => /3er lugar/i.test(row.match.round_name || ""))?.match;
      const finishedGroupMatches = groupRows.filter((row) => row.done).length;
      const groupReady = groupRows.length >= totalGroupMatches && finishedGroupMatches >= totalGroupMatches && standingsRows.length >= 4;
      const groupEndTimes = groupRows.map((row) => slotEndMinutes(row.schedule.time || row.schedule.turn)).filter(Boolean);
      const latestEnd = groupEndTimes.length ? Math.max(...groupEndTimes) : minutesFromSlot(fallbackStart);
      const semiTime = playoffSlotLabel(latestEnd, setMinutes, 0);
      const finalTime = playoffSlotLabel(latestEnd, setMinutes, 1);
      const courts = [...new Set(groupRows.map((row) => row.match.court).filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
      const top = standingsRows.map((standing) => standing.pair || pairById.get(standing.pair_id)).filter(Boolean);
      const semis = groupReady ? [
        !existingSemiOne && top[0] && top[3] ? {
          pair_one_id: top[0].id,
          pair_two_id: top[3].id,
          round_name: `${category} - Fase final - Ronda 4 Semifinal 1 - ${semiTime}`,
          court: courts[0] || "1",
        } : null,
        !existingSemiTwo && top[1] && top[2] ? {
          pair_one_id: top[1].id,
          pair_two_id: top[2].id,
          round_name: `${category} - Fase final - Ronda 4 Semifinal 2 - ${semiTime}`,
          court: courts[1] || courts[0] || "1",
        } : null,
      ].filter(Boolean) : [];
      const semiOneResult = resolveMatchResult(existingSemiOne);
      const semiTwoResult = resolveMatchResult(existingSemiTwo);
      const finalPairs = [semiOneResult.winnerId, semiTwoResult.winnerId].map((id) => pairById.get(id)).filter(Boolean);
      const thirdPairs = [semiOneResult.loserId, semiTwoResult.loserId].map((id) => pairById.get(id)).filter(Boolean);
      const finals = finalPairs.length === 2 && thirdPairs.length === 2 ? [
        !existingFinal ? {
          pair_one_id: finalPairs[0].id,
          pair_two_id: finalPairs[1].id,
          round_name: `${category} - Fase final - Ronda 5 Final - ${finalTime}`,
          court: courts[0] || "1",
        } : null,
        !existingThirdPlace ? {
          pair_one_id: thirdPairs[0].id,
          pair_two_id: thirdPairs[1].id,
          round_name: `${category} - Fase final - Ronda 5 3er lugar - ${finalTime}`,
          court: courts[1] || courts[0] || "1",
        } : null,
      ].filter(Boolean) : [];

      return {
        category,
        finishedGroupMatches,
        totalGroupMatches,
        groupReady,
        allGroupResults: groupReady,
        semiReady: Boolean(existingSemiOne && existingSemiTwo && hasResult(existingSemiOne) && hasResult(existingSemiTwo)),
        semis,
        finals,
        standingsRows,
        existingSemiOne,
        existingSemiTwo,
        existingFinal,
        existingThirdPlace,
        semiTime,
        finalTime,
      };
    });
}
