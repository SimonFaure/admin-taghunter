/**
 * Mid-game mock state used to populate the mystery preview.
 *
 * Mystery's main game screen shows: team name, timer, score, and an enigmas
 * grid (locked vs revealed images). The numbers below are non-zero so the
 * author sees realistic copy in their layout - avoids hiding overflow in
 * tight boxes.
 */

export interface MockMysteryState {
  teamName: string;
  /** Display string for the timer card (mm:ss or hh:mm:ss). */
  timer: string;
  /** Current score (numeric string, drives the gauge fill % too). */
  score: string;
}

export const MOCK_MYSTERY_STATE: MockMysteryState = {
  teamName: 'Équipe 1',
  timer: '00:42:15',
  score: '60',
};
