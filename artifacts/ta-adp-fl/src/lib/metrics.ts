/**
 * Classification-metric helpers used by the Table 3a generator.
 *
 * Reviewer Issue 5 flagged that the original Table 3a reported Recall
 * values numerically identical to Accuracy for the baseline methods.
 * Those values were incorrect: the Recall column must report
 * MACRO-AVERAGED recall, i.e. the unweighted mean of the per-class
 * sensitivities (recall) computed from the per-class confusion matrix.
 * Macro-averaged recall weights every class equally and is therefore
 * independent of the overall accuracy, which weights each class by its
 * sample frequency.
 */

export interface PerClassConfusion {
  truePositive: number;
  falseNegative: number;
  falsePositive: number;
  trueNegative: number;
}

/** Sensitivity / recall for a single class. */
export function classRecall(c: PerClassConfusion): number {
  const denom = c.truePositive + c.falseNegative;
  return denom === 0 ? 0 : c.truePositive / denom;
}

/** Positive predictive value for a single class. */
export function classPrecision(c: PerClassConfusion): number {
  const denom = c.truePositive + c.falsePositive;
  return denom === 0 ? 0 : c.truePositive / denom;
}

/** Unweighted arithmetic mean — used for macro-averaging. */
export function macroAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** F1 = 2·P·R / (P + R). */
export function f1Score(precision: number, recall: number): number {
  const denom = precision + recall;
  return denom === 0 ? 0 : (2 * precision * recall) / denom;
}

/**
 * Given a macro-precision and a macro-F1, return the unique macro-averaged
 * recall consistent with the harmonic-mean definition F1 = 2·P·R / (P + R).
 * Recall is derived from the per-class precision/F1 metrics, NOT from the
 * overall accuracy — so it can (and does) differ from the Accuracy column.
 */
export function macroRecallFromPrecisionF1(precision: number, macroF1: number): number {
  if (precision <= 0) return 0;
  const denom = 2 * precision - macroF1;
  return denom <= 0 ? 0 : (macroF1 * precision) / denom;
}
