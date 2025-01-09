/** Form configuration */
export type FormConfig = {
  /**
   * Delay validation. [milliseconds]
   *
   * @default 100
   */
  validationDelayMs: number;
  /**
   * Delay subsequent validation. [milliseconds]
   *
   * @default 300
   */
  subsequentValidationDelayMs: number;
  /**
   * Delay validation when a field value is intermediate (partial input). [in milliseconds]
   *
   * @default 3000
   */
  interimValidationDelayMs: number;
  /**
   * Whether to suppress errors of intermediate (partial input) fields
   *
   * @default true
   */
  suppressIntermediateErrors: boolean;
};

/** Default form configuration */
export const defaultConfig: FormConfig = Object.freeze({
  validationDelayMs: 100,
  subsequentValidationDelayMs: 300,
  interimValidationDelayMs: 3000,
  suppressIntermediateErrors: true,
});
