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

function emptyGroupStanding(pair) {
  return {
    pair,
    played: 0,
    won: 0,
    points: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  };
}

function standingDiff(standing) {
  return standing.pointsFor - standing.pointsAgainst;
}

function sortGroupStandings(items) {
  return [...items].sort((a, b) => (
    b.points - a.points
    || b.won - a.won
    || standingDiff(b) - standingDiff(a)
    || b.pointsFor - a.pointsFor
    || (a.pair.seed || 9999) - (b.pair.seed || 9999)
    || a.pair.id - b.pair.id
  ));
}

export function computeThreeGroupSemiFinalPlans({ pairs, matches, fixtureConfig = {} }) {
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
  const categories = categoryPairGroups(pairs);

  return Object.entries(categories)
    .filter(([, categoryPairs]) => categoryPairs.length === 12)
    .map(([category]) => {
      const categoryRows = matches
        .map((match) => {
          const schedule = parseFixtureRound(match.round_name);
          return {
            match,
            schedule,
            pairOne: pairById.get(match.pair_one_id),
            pairTwo: pairById.get(match.pair_two_id),
          };
        })
        .filter((row) => fixtureCategoryFromPairs(row.pairOne, row.pairTwo, row.schedule.category) === category);
      const groupRows = categoryRows.filter((row) => /^Grupo\s+/i.test(row.schedule.group || ""));
      const groupedRows = groupRows.reduce((groups, row) => {
        groups[row.schedule.group] = [...(groups[row.schedule.group] || []), row];
        return groups;
      }, {});
      const groupNames = Object.keys(groupedRows).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (groupNames.length !== 3) return null;

      const groupPlans = groupNames.map((groupName) => {
        const rows = groupedRows[groupName];
        const standingsMap = new Map();
        rows.forEach((row) => {
          [row.pairOne, row.pairTwo].filter(Boolean).forEach((pair) => {
            if (!standingsMap.has(pair.id)) standingsMap.set(pair.id, emptyGroupStanding(pair));
          });
        });
        rows.forEach((row) => {
          if (!hasResult(row.match)) return;
          const one = standingsMap.get(row.match.pair_one_id);
          const two = standingsMap.get(row.match.pair_two_id);
          if (!one || !two) return;
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
            one.points += 3;
          } else if (twoScore > oneScore) {
            two.won += 1;
            two.points += 3;
          } else {
            one.points += 1;
            two.points += 1;
          }
        });
        return {
          groupName,
          rows,
          standings: sortGroupStandings([...standingsMap.values()]),
          totalMatches: 6,
          finishedMatches: rows.filter((row) => hasResult(row.match)).length,
        };
      });
      const groupsReady = groupPlans.every((group) => group.rows.length === 6 && group.finishedMatches === 6 && group.standings.length === 4);
      const secondPlaces = sortGroupStandings(groupPlans.map((group) => group.standings[1]).filter(Boolean));
      const bestSecond = secondPlaces[0];
      const latestEnd = Math.max(...groupRows.map((row) => slotEndMinutes(row.schedule.time)).filter(Boolean), minutesFromSlot(fixtureConfig.start_time || "17:00"));
      const slotDurations = groupRows.map((row) => {
        const start = minutesFromSlot(row.schedule.time);
        const end = slotEndMinutes(row.schedule.time);
        return end > start ? end - start : 0;
      }).filter(Boolean);
      const setMinutes = slotDurations.length ? Math.max(...slotDurations) : Number(fixtureConfig.set_minutes || 20);
      const semiTime = playoffSlotLabel(latestEnd, setMinutes);
      const finalTime = playoffSlotLabel(latestEnd, setMinutes, 1);
      const courts = [...new Set(groupRows.map((row) => row.match.court).filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
      const existingSemiOne = categoryRows.find((row) => /semifinal 1/i.test(row.match.round_name || ""))?.match;
      const existingSemiTwo = categoryRows.find((row) => /semifinal 2/i.test(row.match.round_name || ""))?.match;
      const existingFinal = categoryRows.find((row) => /\bfinal\b/i.test(row.match.round_name || "") && !/semifinal/i.test(row.match.round_name || ""))?.match;
      const existingThirdPlace = categoryRows.find((row) => /3er lugar/i.test(row.match.round_name || ""))?.match;
      const firstA = groupPlans[0].standings[0]?.pair;
      const firstB = groupPlans[1].standings[0]?.pair;
      const firstC = groupPlans[2].standings[0]?.pair;
      const semis = groupsReady ? [
        !existingSemiOne && firstA && firstC ? {
          pair_one_id: firstA.id,
          pair_two_id: firstC.id,
          round_name: `${category} - Fase final - Semifinal 1 - ${semiTime}`,
          court: courts[0] || "1",
        } : null,
        !existingSemiTwo && firstB && bestSecond?.pair ? {
          pair_one_id: firstB.id,
          pair_two_id: bestSecond.pair.id,
          round_name: `${category} - Fase final - Semifinal 2 - ${semiTime}`,
          court: courts[1] || courts[0] || "1",
        } : null,
      ].filter(Boolean) : [];
      const semiOneResult = resolveMatchResult(existingSemiOne);
      const semiTwoResult = resolveMatchResult(existingSemiTwo);
      const finalists = [semiOneResult.winnerId, semiTwoResult.winnerId].map((id) => pairById.get(id)).filter(Boolean);
      const thirdPlacePairs = [semiOneResult.loserId, semiTwoResult.loserId].map((id) => pairById.get(id)).filter(Boolean);
      const finals = finalists.length === 2 && thirdPlacePairs.length === 2 ? [
        !existingFinal ? { pair_one_id: finalists[0].id, pair_two_id: finalists[1].id, round_name: `${category} - Fase final - Final - ${finalTime}`, court: courts[0] || "1" } : null,
        !existingThirdPlace ? { pair_one_id: thirdPlacePairs[0].id, pair_two_id: thirdPlacePairs[1].id, round_name: `${category} - Fase final - 3er lugar - ${finalTime}`, court: courts[1] || courts[0] || "1" } : null,
      ].filter(Boolean) : [];

      return {
        type: "three_group_semis",
        category,
        groupPlans,
        bestSecond,
        finishedGroupMatches: groupPlans.reduce((sum, group) => sum + group.finishedMatches, 0),
        totalGroupMatches: 18,
        groupReady: groupsReady,
        allGroupResults: groupsReady,
        semis,
        finals,
        existingSemiOne,
        existingSemiTwo,
        existingFinal,
        existingThirdPlace,
        semiTime,
        finalTime,
      };
    })
    .filter(Boolean);
}

export function computeGroupPlacementFinalPlans({ pairs, matches, fixtureConfig = {} }) {
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
  const setMinutes = Number(fixtureConfig.set_minutes || 20);
  const fallbackStart = fixtureConfig.start_time || "21:10";
  const matchRows = matches.map((match) => {
    const schedule = parseFixtureRound(match.round_name);
    const pairOne = pairById.get(match.pair_one_id);
    const pairTwo = pairById.get(match.pair_two_id);
    const category = fixtureCategoryFromPairs(pairOne, pairTwo, schedule.category);
    return { match, schedule, pairOne, pairTwo, category, done: hasResult(match) };
  });
  const categories = categoryPairGroups(pairs);

  return Object.entries(categories)
    .filter(([, categoryPairs]) => categoryPairs.length === 8)
    .map(([category]) => {
      const categoryRows = matchRows.filter((row) => row.category === category);
      const groupRows = categoryRows.filter((row) => /^Grupo\s+/i.test(row.schedule.group || ""));
      const groups = groupRows.reduce((collection, row) => {
        const groupName = row.schedule.group;
        collection[groupName] = [...(collection[groupName] || []), row];
        return collection;
      }, {});
      const groupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).slice(0, 2);
      if (groupNames.length < 2) return null;

      const groupPlans = groupNames.map((groupName) => {
        const rows = groups[groupName];
        const standingsMap = new Map();
        rows.forEach((row) => {
          [row.pairOne, row.pairTwo].filter(Boolean).forEach((pair) => {
            if (!standingsMap.has(pair.id)) standingsMap.set(pair.id, emptyGroupStanding(pair));
          });
        });
        rows.forEach((row) => {
          if (!hasResult(row.match)) return;
          const one = standingsMap.get(row.match.pair_one_id);
          const two = standingsMap.get(row.match.pair_two_id);
          if (!one || !two) return;
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
            one.points += 3;
          } else if (twoScore > oneScore) {
            two.won += 1;
            two.points += 3;
          } else {
            one.points += 1;
            two.points += 1;
          }
        });
        return {
          groupName,
          rows,
          standings: sortGroupStandings([...standingsMap.values()]),
          totalMatches: 6,
          finishedMatches: rows.filter((row) => row.done).length,
        };
      });
      const groupsReady = groupPlans.every((group) => group.rows.length >= group.totalMatches && group.finishedMatches >= group.totalMatches && group.standings.length >= 4);
      const groupEndTimes = groupRows.map((row) => slotEndMinutes(row.schedule.time || row.schedule.turn)).filter(Boolean);
      const latestEnd = groupEndTimes.length ? Math.max(...groupEndTimes) : minutesFromSlot(fallbackStart);
      const placementTime = playoffSlotLabel(latestEnd, setMinutes, 0);
      const courts = [...new Set(groupRows.map((row) => row.match.court).filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
      const labels = ["Final", "3er lugar", "5to lugar", "7mo lugar"];
      const existingByLabel = Object.fromEntries(labels.map((label) => [
        label,
        categoryRows.find((row) => new RegExp(label, "i").test(row.match.round_name || ""))?.match,
      ]));
      const placementMatches = groupsReady ? labels.map((label, index) => {
        if (existingByLabel[label]) return null;
        const left = groupPlans[0].standings[index]?.pair;
        const right = groupPlans[1].standings[index]?.pair;
        if (!left || !right) return null;
        return {
          pair_one_id: left.id,
          pair_two_id: right.id,
          round_name: `${category} - Fase final - Ronda 4 ${label} - ${placementTime}`,
          court: courts[index] || courts[0] || String(index + 1),
        };
      }).filter(Boolean) : [];

      return {
        type: "placements",
        category,
        groupPlans,
        finishedGroupMatches: groupPlans.reduce((sum, group) => sum + group.finishedMatches, 0),
        totalGroupMatches: groupPlans.reduce((sum, group) => sum + group.totalMatches, 0),
        groupReady: groupsReady,
        allGroupResults: groupsReady,
        placementTime,
        placementMatches,
      };
    })
    .filter(Boolean);
}

export function computeFinalPlans(options) {
  return [
    ...computeFourPairFinalPlans(options).map((plan) => ({ ...plan, type: "semis" })),
    ...computeGroupPlacementFinalPlans(options),
    ...computeThreeGroupSemiFinalPlans(options),
  ];
}
