/** Form configuration */
export type FormConfig = {
  /** Delay validation when a field is being edited (in milliseconds) */
  interimValidationDelayMs: number;
  /** Whether to suppress provisional errors */
  suppressProvisionalErrors: boolean;
};

/** Default form configuration */
export const defaultConfig: FormConfig = Object.freeze({
  interimValidationDelayMs: 3000,
  suppressProvisionalErrors: true,
});
