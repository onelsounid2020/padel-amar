import test from "node:test";
import assert from "node:assert/strict";

import { computeFinalPlans, computeFinalRanking, computeRankingPlacementFixture } from "./fixtureFinals.js";

const pairs = Array.from({ length: 8 }, (_, index) => ({
  id: index + 1,
  category: "Mujeres",
  status: "completa",
  player_two_id: 100 + index,
  seed: index + 1,
}));

const groupA = [1, 2, 3, 4];
const groupB = [5, 6, 7, 8];

function groupMatches(group, ids, courtStart) {
  const rounds = [
    [[ids[0], ids[1]], [ids[2], ids[3]]],
    [[ids[0], ids[2]], [ids[1], ids[3]]],
    [[ids[0], ids[3]], [ids[1], ids[2]]],
  ];
  return rounds.flatMap((round, roundIndex) => round.map(([one, two], courtIndex) => ({
    id: `${group}-${roundIndex}-${courtIndex}`,
    pair_one_id: one,
    pair_two_id: two,
    pair_one_score: 6,
    pair_two_score: one === ids[0] || one === ids[1] ? 2 : 5,
    round_name: `Mujeres - ${group} - Ronda ${roundIndex + 1} - 16:${String(roundIndex * 20).padStart(2, "0")}-16:${String((roundIndex + 1) * 20).padStart(2, "0")}`,
    court: String(courtStart + (courtIndex * 2)),
  })));
}

const classification = [
  ...groupMatches("Grupo A", groupA, 1),
  ...groupMatches("Grupo B", groupB, 5),
];

const options = {
  pairs,
  standings: [],
  fixtureConfig: {
    set_minutes: 20,
    category_playoff_modes: { Mujeres: "crossed_semifinals" },
  },
};

test("genera semifinales cruzadas entre dos grupos de cuatro", () => {
  const [plan] = computeFinalPlans({ ...options, matches: classification });
  assert.equal(plan.type, "crossed_semis");
  assert.equal(plan.allGroupResults, true);
  assert.equal(plan.semis.length, 2);
  assert.deepEqual(
    plan.semis.map((match) => [match.pair_one_id, match.pair_two_id]),
    [[1, 6], [5, 2]],
  );
  assert.match(plan.semis[0].round_name, /1A vs 2B/);
  assert.match(plan.semis[1].round_name, /1B vs 2A/);
});

test("habilita la final únicamente después de cerrar ambas semifinales", () => {
  const semis = [
    {
      id: "semi-1",
      pair_one_id: 1,
      pair_two_id: 6,
      pair_one_score: 6,
      pair_two_score: 3,
      round_name: "Mujeres - Fase final - Ronda 4 Semifinal 1 (1A vs 2B) - 17:00-17:20",
      court: "1",
    },
    {
      id: "semi-2",
      pair_one_id: 5,
      pair_two_id: 2,
      pair_one_score: 4,
      pair_two_score: 6,
      round_name: "Mujeres - Fase final - Ronda 4 Semifinal 2 (1B vs 2A) - 17:00-17:20",
      court: "3",
    },
  ];
  const [plan] = computeFinalPlans({ ...options, matches: [...classification, ...semis] });
  assert.equal(plan.semis.length, 0);
  assert.equal(plan.finals.length, 1);
  assert.deepEqual([plan.finals[0].pair_one_id, plan.finals[0].pair_two_id], [1, 2]);
  assert.match(plan.finals[0].round_name, /Ronda 5 Final/);
});

test("no ofrece una ronda de posiciones incompatible y reconoce el resultado de la final", () => {
  const final = {
    id: "final",
    pair_one_id: 1,
    pair_two_id: 2,
    pair_one_score: 6,
    pair_two_score: 4,
    round_name: "Mujeres - Fase final - Ronda 5 Final - 17:20-17:40",
    court: "1",
  };
  const placementPlans = computeRankingPlacementFixture({
    ...options,
    matches: [...classification, final],
    standings: pairs.map((pair, index) => ({ pair_id: pair.id, pair, position: index + 1 })),
  });
  assert.equal(placementPlans.length, 0);

  const [ranking] = computeFinalRanking({ pairs, matches: [final] });
  assert.equal(ranking.ready, true);
  assert.deepEqual(ranking.placements.map((placement) => [placement.position, placement.pair.id]), [[1, 1], [2, 2]]);
});
