export type FormConfig = {
  interimValidationDelayMs: number;
  suppressProvisionalErrors: boolean;
};

export const defaultConfig: FormConfig = {
  interimValidationDelayMs: 3000,
  suppressProvisionalErrors: true,
};
