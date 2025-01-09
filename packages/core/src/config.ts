import { observable, runInAction } from "mobx";

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

/** Default configuration */
export const defaultConfig: Readonly<FormConfig> = Object.freeze({
  validationDelayMs: 100,
  subsequentValidationDelayMs: 300,
  interimValidationDelayMs: 3000,
  suppressIntermediateErrors: true,
});

/** Global configuration */
export const globalConfig = observable.object(defaultConfig);

/** Update the global configuration */
export function configureForm(config: Partial<Readonly<FormConfig>>): Readonly<FormConfig>;

/** Reset the global configuration to the default */
export function configureForm(reset: true): Readonly<FormConfig>;

export function configureForm(config: true | Partial<Readonly<FormConfig>>): Readonly<FormConfig> {
  runInAction(() => {
    if (config === true) {
      Object.assign(globalConfig, defaultConfig);
    } else {
      Object.assign(globalConfig, config);
    }
  });
  return globalConfig;
}
