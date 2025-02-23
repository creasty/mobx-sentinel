import { observable, runInAction } from "mobx";

/** Form configuration */
export type FormConfig = {
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
