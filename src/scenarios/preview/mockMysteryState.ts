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
  /** Display string for the timer card. MUST match the playground's format -
   *  `MysteryGamePage.formatTime` emits MM:SS. An hh:mm:ss mock made the timer
   *  box auto-fit a string a third longer than the real one, so the preview
   *  under-sized the text and the layout could not be calibrated (retour #42). */
  timer: string;
  /** Current score (numeric string, drives the gauge fill % too). */
  score: string;
}

export const MOCK_MYSTERY_STATE: MockMysteryState = {
  teamName: 'Équipe 1',
  timer: '42:15',
  score: '60',
};
