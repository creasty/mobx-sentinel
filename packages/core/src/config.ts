/** Form configuration */
export type FormConfig = {
  /**
   * Delay validation when a field is being edited (in milliseconds)
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
  interimValidationDelayMs: 3000,
  suppressIntermediateErrors: true,
});
