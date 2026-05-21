/**
 * Plausible mid-game state used to populate the preview's team strip.
 *
 * The preview is a static visual check, not a runtime; these numbers are
 * deliberately non-zero so authors can see how their layout reads with
 * realistic content (avoids hiding overflow issues in narrow boxes).
 *
 * Plan: C:\Users\faure\.claude\plans\we-need-a-preview-refactored-pretzel.md (decision #10)
 */

export interface MockTeamStrip {
  teamName: string;
  score: string;
  malusTimes: string;
  malusPoints: string;
  lateMalusTimes: string;
  lateMalusPoints: string;
  combo6Times: string;
  combo6Points: string;
  combo4Times: string;
  combo4Points: string;
  combo2Times: string;
  combo2Points: string;
  /** One entry per quest. `null` slots in `mockAdvancement` mean "not found yet". */
  questAdvancement: { times: string; points: string }[];
  timerHours: string;
  timerMinutes: string;
  timerSeconds: string;
}

export const MOCK_TEAM_STRIP: MockTeamStrip = {
  teamName: 'Équipe 1',
  score: '150',
  malusTimes: '2',
  malusPoints: '8',
  lateMalusTimes: '1',
  lateMalusPoints: '1',
  combo6Times: '0',
  combo6Points: '0',
  combo4Times: '1',
  combo4Points: '10',
  combo2Times: '3',
  combo2Points: '15',
  questAdvancement: [],
  timerHours: '00',
  timerMinutes: '21',
  timerSeconds: '28',
};

export function buildAdvancementForQuests(questCount: number): { times: string; points: string }[] {
  // Quest 1 found x1 for 6pts, quest 3 found x1 for 4pts, others zero.
  const out: { times: string; points: string }[] = [];
  for (let i = 0; i < questCount; i++) {
    if (i === 0) out.push({ times: '1', points: '6' });
    else if (i === 2) out.push({ times: '1', points: '4' });
    else out.push({ times: '0', points: '0' });
  }
  return out;
}
