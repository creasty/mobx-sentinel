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
    expect(configureForm({ autoFinalizationDelayMs: 999 })).toEqual({
      ...defaultConfig,
      autoFinalizationDelayMs: 999,
    });
    expect(configureForm({ allowSubmitInvalid: true })).toEqual({
      ...defaultConfig,
      autoFinalizationDelayMs: 999,
      allowSubmitInvalid: true,
    });
    expect(configureForm({})).toEqual({
      ...defaultConfig,
      autoFinalizationDelayMs: 999,
      allowSubmitInvalid: true,
    });
  });

  it("returns the default config if true is provided", () => {
    expect(configureForm({ autoFinalizationDelayMs: 999 })).toEqual({
      ...defaultConfig,
      autoFinalizationDelayMs: 999,
    });
    expect(configureForm(true)).toEqual(defaultConfig);
  });

  it("updates globalConfig reactively", () => {
    const timeline: FormConfig[] = [];
    autorun(() => {
      timeline.push({ ...globalConfig });
    });

    configureForm({ autoFinalizationDelayMs: 999 });
    configureForm({ allowSubmitInvalid: true });
    configureForm({});
    configureForm(true);

    expect(timeline).toEqual([
      defaultConfig,
      { ...defaultConfig, autoFinalizationDelayMs: 999 },
      { ...defaultConfig, autoFinalizationDelayMs: 999, allowSubmitInvalid: true },
      defaultConfig,
    ]);
  });
});
