/** Form configuration */
export type FormConfig = {
  /**
   * Delay validation when a field is being edited (in milliseconds)
   *
   * @default 3000
   */
  interimValidationDelayMs: number;
  /**
   * Whether to suppress provisional errors
   *
   * @default true
   */
  suppressProvisionalErrors: boolean;
};

/** Default form configuration */
export const defaultConfig: FormConfig = Object.freeze({
  interimValidationDelayMs: 3000,
  suppressProvisionalErrors: true,
});
