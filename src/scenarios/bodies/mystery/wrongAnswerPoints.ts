/**
 * Wrong-answer points are authored SIGNED, exactly like the two game-level
 * maluses (`malus_both_answers_biped` / `malus_no_answer`): the author types
 * `-5` and the runtime ADDS -5 to the team's score. Authoring the penalty as a
 * bare positive magnitude that the runtime silently subtracted was the
 * inconsistency this normalizer removes - one convention for every negative
 * number in the mystery editor.
 *
 * Legacy scenarios stored the magnitude (`"5"` meaning "-5 points"), so every
 * reader (studio, playground, GO/Spot) treats a POSITIVE value as a penalty
 * too. That is what makes the change safe on data authored before it; this
 * helper is what makes newly-saved data carry the sign the author sees.
 */

/**
 * Canonical form of an authored wrong-answer-points value: negative, or blank.
 *
 * Kept string-in / string-out because the enigma field is a free-text input
 * bound straight to the model - the user must be able to hold a half-typed
 * value ("", "-") without it being rewritten under the caret.
 */
export function normalizeWrongAnswerPoints(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const s = String(raw).trim();
  if (s === '' || s === '-') return s;
  const n = Number(s);
  // Not a number (yet): leave it alone rather than mangle what is being typed.
  if (!Number.isFinite(n)) return s;
  if (n === 0) return '0';
  return n > 0 ? `-${s.replace(/^\+/, '')}` : s;
}

/**
 * Signed points a wrong answer is worth, for display/preview code. Positive
 * legacy magnitudes fold to their negative, so both authorings read alike.
 */
export function wrongAnswerPointsValue(raw: unknown): number {
  const n = Number(String(raw ?? '').trim());
  if (!Number.isFinite(n) || n === 0) return 0;
  return -Math.abs(n);
}
