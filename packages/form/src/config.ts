import { observable, runInAction } from "mobx";

/** Form configuration */
export type FormConfig = {
  /**
   * Delay reactive validation. [milliseconds]
   *
   * @default 100
   */
  reactiveValidationDelayMs: number;
  /**
   * Delay async validation. [milliseconds]
   *
   * @default 100
   */
  asyncValidationEnqueueDelayMs: number;
  /**
   * Delay subsequent async validation. [milliseconds]
   *
   * When requesting a new validation while the previous validation is running,
   * this delay is applied to the new validation.
   *
   * @default 300
   */
  asyncValidationScheduleDelayMs: number;
  /**
   * Automatically finalize the form when the input is intermediate (partial input). [in milliseconds]
   *
   * @default 3000
   */
  autoFinalizationDelayMs: number;
  /**
   * Allow submission even if the form is not dirty.
   *
   * @default false
   */
  allowSubmitNonDirty: boolean;
  /**
   * Allow submission even if the form is invalid.
   *
   * @default false
   */
  allowSubmitInvalid: boolean;
};

/** Default configuration */
export const defaultConfig: Readonly<FormConfig> = Object.freeze({
  reactiveValidationDelayMs: 100,
  asyncValidationEnqueueDelayMs: 100,
  asyncValidationScheduleDelayMs: 300,
  autoFinalizationDelayMs: 3000,
  allowSubmitNonDirty: false,
  allowSubmitInvalid: false,
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
