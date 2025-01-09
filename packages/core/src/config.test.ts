import { autorun, isObservableObject } from "mobx";
import { configureForm, defaultConfig, FormConfig, globalConfig } from "./config";

describe("defaultConfig", () => {
  it("is frozen", () => {
    expect(Object.isFrozen(defaultConfig)).toBe(true);
  });
});

describe("globalConfig", () => {
  it("is an observable object", () => {
    expect(isObservableObject(globalConfig)).toBe(true);
  });
});

describe("configureForm", () => {
  beforeEach(() => {
    configureForm(true);
    expect(globalConfig).toEqual(defaultConfig);
  });
  afterEach(() => {
    configureForm(true);
    expect(globalConfig).toEqual(defaultConfig);
  });

  it("returns the current config if an empty object is provided", () => {
    expect(configureForm({})).toEqual(defaultConfig);
  });

  it("returns the new config if a non-empty object is provided", () => {
    expect(configureForm({ validationDelayMs: 999 })).toEqual({ ...defaultConfig, validationDelayMs: 999 });
    expect(configureForm({ subsequentValidationDelayMs: 888 })).toEqual({
      ...defaultConfig,
      validationDelayMs: 999,
      subsequentValidationDelayMs: 888,
    });
    expect(configureForm({})).toEqual({
      ...defaultConfig,
      validationDelayMs: 999,
      subsequentValidationDelayMs: 888,
    });
  });

  it("returns the default config if true is provided", () => {
    expect(configureForm({ validationDelayMs: 999 })).toEqual({ ...defaultConfig, validationDelayMs: 999 });
    expect(configureForm(true)).toEqual(defaultConfig);
  });

  it("updates globalConfig reactively", () => {
    const timeline: FormConfig[] = [];
    autorun(() => {
      timeline.push({ ...globalConfig });
    });

    configureForm({ validationDelayMs: 999 });
    configureForm({ subsequentValidationDelayMs: 888 });
    configureForm({});
    configureForm(true);

    expect(timeline).toEqual([
      defaultConfig,
      { ...defaultConfig, validationDelayMs: 999 },
      { ...defaultConfig, validationDelayMs: 999, subsequentValidationDelayMs: 888 },
      defaultConfig,
    ]);
  });
});
