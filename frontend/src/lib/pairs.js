export function pairName(pair) {
  const second = pair.player_two ? pair.player_two.name : "busca partner";
  return `${pair.player_one.name} / ${second}`;
}

export function rankingGroupByPair(matches = []) {
  const groups = new Map();
  matches.forEach((match) => {
    const group = (match.round_name || "").match(/\bGrupo\s+([A-Z])\b/i);
    if (!group) return;
    const label = `Grupo ${group[1].toUpperCase()}`;
    if (!groups.has(match.pair_one_id)) groups.set(match.pair_one_id, label);
    if (!groups.has(match.pair_two_id)) groups.set(match.pair_two_id, label);
  });
  return groups;
}

export function rankingGroupClass(group) {
  const letter = (group || "").match(/\b([A-Z])$/i)?.[1]?.toLowerCase();
  return letter ? `ranking-group-${letter}` : "";
}
