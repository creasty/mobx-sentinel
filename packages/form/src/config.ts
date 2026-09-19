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
   * Allow submission even if the form is invalid.
   *
   * @default false
   */
  allowSubmitInvalid: boolean;
};

/** Default configuration */
export const defaultConfig: Readonly<FormConfig> = Object.freeze({
  autoFinalizationDelayMs: 3000,
  allowSubmitInvalid: false,
});

/** Global configuration */
export const globalConfig = observable.object(defaultConfig);

/**
 * Merge the entries of `config` into `target`, ignoring the ones whose value is `undefined`
 *
 * @remarks
 * Mirrors `Object.assign` otherwise, down to what it does with a non-object argument: `Object(config)` yields no own
 * keys for `null` and for most primitives, but a string yields its characters under the keys "0", "1" and so on.
 *
 * @internal @ignore
 */
export function mergeConfig(target: Partial<FormConfig>, config: unknown) {
  const source: Record<string, unknown> = Object(config);
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (value === undefined) continue;
    (target as Record<string, unknown>)[key] = value;
  }
}

/**
 * Update the global configuration
 *
 * @remarks Entries whose value is `undefined` are ignored, leaving the configured value as it is.
 */
export function configureForm(config: Partial<Readonly<FormConfig>>): Readonly<FormConfig>;

/** Reset the global configuration to the default */
export function configureForm(reset: true): Readonly<FormConfig>;

export function configureForm(config: true | Partial<Readonly<FormConfig>>): Readonly<FormConfig> {
  runInAction(() => {
    if (config === true) {
      for (const key of Object.keys(globalConfig)) {
        if (!Object.hasOwn(defaultConfig, key)) {
          delete (globalConfig as Record<string, unknown>)[key];
        }
      }
      Object.assign(globalConfig, defaultConfig);
    } else {
      mergeConfig(globalConfig, config);
    }
  });
  return globalConfig;
}
