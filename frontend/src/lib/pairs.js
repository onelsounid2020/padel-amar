export function pairName(pair) {
  const second = pair.player_two ? pair.player_two.name : "busca partner";
  return `${pair.player_one.name} / ${second}`;
}
