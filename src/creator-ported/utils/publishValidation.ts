export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  field: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function check(issues: ValidationIssue[], condition: boolean, field: string, message: string, severity: ValidationSeverity) {
  if (!condition) {
    issues.push({ field, message, severity });
  }
}

export function validateTagquestConfig(config: any, scenarioTitle: string, scenarioDescription: string): ValidationResult {
  const issues: ValidationIssue[] = [];

  check(issues, !!scenarioTitle?.trim(), 'title', 'Scenario title is required', 'error');
  check(issues, !!scenarioDescription?.trim(), 'description', 'Scenario description is required', 'warning');
  check(issues, !!config.background_image, 'background_image', 'Background image is required', 'error');
  check(issues, !!config.game_visual, 'game_visual', 'Game visual image is required', 'error');
  if (config.use_default_template === false) {
    check(issues, !!config.custom_template, 'custom_template', 'Custom template is required when "Use default template" is off', 'error');
  }
  check(issues, !!config.top_1_image, 'top_1_image', 'Top 1 image is required', 'warning');
  check(issues, !!config.top_3_image, 'top_3_image', 'Top 3 image is required', 'warning');
  check(issues, !!config.top_10_image, 'top_10_image', 'Top 10 image is required', 'warning');

  const questCount = config.quests?.length ?? 0;
  check(issues, questCount > 0, 'quests', 'At least one quest is required', 'error');
  check(issues, questCount <= 6, 'quests', 'Tagquest supports at most 6 quests', 'error');

  if (questCount > 0) {
    config.quests.forEach((q: any, i: number) => {
      check(issues, !!q.main_image, `quests[${i}].main_image`, `Quest ${i + 1}: main image is required`, 'error');
      check(issues, !!q.image_1, `quests[${i}].image_1`, `Quest ${i + 1}: top-left piece is required`, 'error');
      check(issues, !!q.image_2, `quests[${i}].image_2`, `Quest ${i + 1}: top-right piece is required`, 'error');
      check(issues, !!q.image_3, `quests[${i}].image_3`, `Quest ${i + 1}: bottom-left piece is required`, 'error');
      check(issues, !!q.image_4, `quests[${i}].image_4`, `Quest ${i + 1}: bottom-right piece is required`, 'error');
      check(issues, !!q.name, `quests[${i}].name`, `Quest ${i + 1}: name is required`, 'warning');
      check(issues, !!q.points && q.points !== '0', `quests[${i}].points`, `Quest ${i + 1}: points should be greater than 0`, 'warning');
    });
  }

  const levelCount = Object.keys(config.levels ?? {}).length;
  check(issues, levelCount > 0, 'levels', 'At least one level is required', 'warning');

  check(issues, !!config.end_station && config.end_station !== '0', 'end_station', 'End station number should be set', 'warning');
  check(issues, !!config.default_time && config.default_time !== '0', 'default_time', 'Default game time should be greater than 0', 'warning');

  return {
    valid: issues.filter((i) => i.severity === 'error').length === 0,
    errors: issues.filter((i) => i.severity === 'error'),
    warnings: issues.filter((i) => i.severity === 'warning'),
  };
}

export function validateMysteryConfig(config: any, scenarioTitle: string, scenarioDescription: string): ValidationResult {
  const issues: ValidationIssue[] = [];

  check(issues, !!scenarioTitle?.trim(), 'title', 'Scenario title is required', 'error');
  check(issues, !!scenarioDescription?.trim(), 'description', 'Scenario description is required', 'warning');
  check(issues, !!config.background_image, 'background_image', 'Background image is required', 'error');
  check(issues, !!config.game_visual, 'game_visual', 'Game visual image is required', 'error');
  check(issues, !!config.levels_gauge_image, 'levels_gauge_image', 'Levels gauge image is required', 'warning');
  check(issues, !!config.levels_gauge_image_with_content, 'levels_gauge_image_with_content', 'Levels gauge with content image is required', 'warning');
  check(issues, !!config.time_background_image, 'time_background_image', 'Time background image is required', 'warning');
  check(issues, !!config.score_background_image, 'score_background_image', 'Score background image is required', 'warning');
  check(issues, !!config.enigmas_header_image, 'enigmas_header_image', 'Enigmas header image is required', 'warning');
  check(issues, !!config.top_1_image, 'top_1_image', 'Top 1 image is required', 'warning');
  check(issues, !!config.top_3_image, 'top_3_image', 'Top 3 image is required', 'warning');
  check(issues, !!config.top_10_image, 'top_10_image', 'Top 10 image is required', 'warning');

  const enigmaCount = config.enigmas?.length ?? 0;
  check(issues, enigmaCount > 0, 'enigmas', 'At least one enigma is required', 'error');

  if (enigmaCount > 0) {
    config.enigmas.forEach((e: any, i: number) => {
      check(issues, !!e.good_answer_image, `enigmas[${i}].good_answer_image`, `Enigma ${i + 1}: good answer image is required`, 'error');
      check(issues, !!e.text, `enigmas[${i}].text`, `Enigma ${i + 1}: text/question is required`, 'warning');
      check(issues, !!e.good_answer_points && e.good_answer_points !== '0', `enigmas[${i}].good_answer_points`, `Enigma ${i + 1}: good answer points should be greater than 0`, 'warning');
    });
  }

  const levelCount = Object.keys(config.levels ?? {}).length;
  check(issues, levelCount > 0, 'levels', 'At least one level is required', 'warning');

  check(issues, !!config.default_time && config.default_time !== '0', 'default_time', 'Default game time should be greater than 0', 'warning');
  check(issues, !!config.score_full_game && config.score_full_game !== '0', 'score_full_game', 'Full game score should be greater than 0', 'warning');

  return {
    valid: issues.filter((i) => i.severity === 'error').length === 0,
    errors: issues.filter((i) => i.severity === 'error'),
    warnings: issues.filter((i) => i.severity === 'warning'),
  };
}
