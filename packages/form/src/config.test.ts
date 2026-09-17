import {
  autorun,
  configure as configureMobx,
  isObservableObject,
  isObservableProp,
  observable,
  reaction,
  runInAction,
} from "mobx";
import { configureForm, defaultConfig, FormConfig, globalConfig } from "./config";
import { Form } from "./form";

/** Wraps type-level assertions that must (or must not) compile; the callback is never executed */
function typeOnly(_fn: () => void) {}

/** Reset the global configuration, including keys that `configureForm(true)` leaves behind */
function resetGlobalConfig() {
  configureForm(true);
  runInAction(() => {
    for (const key of Object.keys(globalConfig)) {
      if (!(key in defaultConfig)) {
        delete (globalConfig as any)[key];
      }
    }
  });
}

const configKeys = ["autoFinalizationDelayMs", "allowSubmitInvalid"] as const;

describe("defaultConfig", () => {
  it("is frozen", () => {
    expect(Object.isFrozen(defaultConfig)).toBe(true);
  });

  it("has the documented default values", () => {
    expect(defaultConfig).toStrictEqual({
      autoFinalizationDelayMs: 3000,
      allowSubmitInvalid: false,
    });
  });

  it("throws when mutated at runtime", () => {
    expect(() => {
      (defaultConfig as any).autoFinalizationDelayMs = 1;
    }).toThrow(TypeError);
    expect(defaultConfig.autoFinalizationDelayMs).toBe(3000);
  });

  test("types", () => {
    expectTypeOf(defaultConfig).toEqualTypeOf<Readonly<FormConfig>>();
    expectTypeOf<FormConfig>().toEqualTypeOf<{
      autoFinalizationDelayMs: number;
      allowSubmitInvalid: boolean;
    }>();

    typeOnly(() => {
      // @ts-expect-error Read-only
      defaultConfig.autoFinalizationDelayMs = 1;
    });
  });
});

describe("globalConfig", () => {
  afterEach(() => {
    resetGlobalConfig();
  });

  it("is an observable object", () => {
    expect(isObservableObject(globalConfig)).toBe(true);
  });

  it("has an observable property for every config key", () => {
    expect(Object.keys(globalConfig)).toEqual(configKeys);
    for (const key of configKeys) {
      expect(isObservableProp(globalConfig, key)).toBe(true);
    }
  });

  it("is a separate object from defaultConfig", () => {
    expect(globalConfig).not.toBe(defaultConfig);
    configureForm({ autoFinalizationDelayMs: 1, allowSubmitInvalid: true });
    expect(defaultConfig).toStrictEqual({
      autoFinalizationDelayMs: 3000,
      allowSubmitInvalid: false,
    });
  });

  test("types", () => {
    expectTypeOf(globalConfig).toEqualTypeOf<Readonly<FormConfig>>();

    typeOnly(() => {
      // @ts-expect-error Read-only
      globalConfig.autoFinalizationDelayMs = 1;
    });
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
    const dispose = autorun(() => {
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
    dispose();
  });
});

describe("configureForm (details)", () => {
  beforeEach(() => {
    resetGlobalConfig();
  });
  afterEach(() => {
    resetGlobalConfig();
    expect(Object.keys(globalConfig)).toEqual(configKeys);
  });

  describe("Return value", () => {
    it("returns the live globalConfig object rather than a snapshot", () => {
      const returned = configureForm({ autoFinalizationDelayMs: 1 });
      // PINNED(quirk): The returned value is globalConfig itself, so it keeps changing with later calls despite its Readonly type. Decide: should configureForm return a frozen snapshot instead?
      expect(returned).toBe(globalConfig);
      expect(configureForm(true)).toBe(returned);
      expect(returned.autoFinalizationDelayMs).toBe(3000);
    });
  });

  describe("Reactivity", () => {
    it("applies multiple keys in a single batch", () => {
      const seen: FormConfig[] = [];
      const dispose = reaction(
        () => ({ ...globalConfig }),
        (config) => seen.push(config)
      );
      try {
        configureForm({ autoFinalizationDelayMs: 1, allowSubmitInvalid: true });
        expect(seen).toEqual([{ autoFinalizationDelayMs: 1, allowSubmitInvalid: true }]);

        configureForm(true);
        expect(seen).toEqual([{ autoFinalizationDelayMs: 1, allowSubmitInvalid: true }, defaultConfig]);
      } finally {
        dispose();
      }
    });

    it("does not notify observers when the values are unchanged", () => {
      const listener = vi.fn();
      const dispose = reaction(() => ({ ...globalConfig }), listener);
      try {
        configureForm({});
        configureForm({ autoFinalizationDelayMs: 3000, allowSubmitInvalid: false });
        configureForm(true);
        expect(listener).not.toHaveBeenCalled();
      } finally {
        dispose();
      }
    });

    it("notifies only the observers of the changed keys", () => {
      const delayListener = vi.fn();
      const invalidListener = vi.fn();
      const dispose1 = reaction(() => globalConfig.autoFinalizationDelayMs, delayListener);
      const dispose2 = reaction(() => globalConfig.allowSubmitInvalid, invalidListener);
      try {
        configureForm({ autoFinalizationDelayMs: 1 });
        expect(delayListener).toHaveBeenCalledTimes(1);
        expect(invalidListener).not.toHaveBeenCalled();
      } finally {
        dispose1();
        dispose2();
      }
    });

    it("updates observed values inside an action (no strict-mode warnings)", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      configureMobx({ enforceActions: "always" });
      const dispose = autorun(() => void { ...globalConfig });
      try {
        configureForm({ autoFinalizationDelayMs: 1 });
        configureForm(true);
        expect(warn).not.toHaveBeenCalled();
      } finally {
        dispose();
        configureMobx({ enforceActions: "observed" });
        warn.mockRestore();
      }
    });
  });

  describe("Invalid input", () => {
    it("keeps unknown keys after a reset", () => {
      // No cast needed: excess property checks do not apply to a non-literal argument
      const extended = { allowSubmitInvalid: false, unknownKey: 1 };
      configureForm(extended);
      expect(globalConfig).toHaveProperty("unknownKey", 1);
      expect(Form.get({}).config).toHaveProperty("unknownKey", 1);

      configureForm(true);
      // PINNED(bug): Reset only re-assigns the default keys, so an unknown key stays on globalConfig (and in every Form#config). Expected: `configureForm(true)` resets globalConfig to exactly the defaults, as its JSDoc says. Flip this assertion when fixing.
      expect(globalConfig).toHaveProperty("unknownKey", 1);
    });

    it("stores explicit undefined values, overriding the defaults", () => {
      // Accepted by the type since `Partial` allows `undefined` without exactOptionalPropertyTypes
      configureForm({ autoFinalizationDelayMs: undefined });
      // PINNED(bug): An explicit `undefined` is assigned as-is, so the number-typed autoFinalizationDelayMs becomes undefined for globalConfig and every form. Expected: undefined entries are ignored and the value stays 3000. Flip these assertions when fixing.
      expect(globalConfig.autoFinalizationDelayMs).toBeUndefined();
      expect(Form.get({}).config.autoFinalizationDelayMs).toBeUndefined();
    });

    it("stores out-of-range numbers without validation", () => {
      // No validation: any number (negative, NaN, infinite) is stored as given
      configureForm({ autoFinalizationDelayMs: -1 });
      expect(globalConfig.autoFinalizationDelayMs).toBe(-1);
      configureForm({ autoFinalizationDelayMs: Number.NaN });
      expect(globalConfig.autoFinalizationDelayMs).toBeNaN();
      configureForm({ autoFinalizationDelayMs: Number.POSITIVE_INFINITY });
      expect(globalConfig.autoFinalizationDelayMs).toBe(Number.POSITIVE_INFINITY);
    });

    it("ignores null and false at runtime", () => {
      configureForm({ autoFinalizationDelayMs: 1 });
      expect(configureForm(null as any)).toEqual({ ...defaultConfig, autoFinalizationDelayMs: 1 });
      expect(configureForm(false as any)).toEqual({ ...defaultConfig, autoFinalizationDelayMs: 1 });
      expect(Object.keys(globalConfig)).toEqual(configKeys);
    });

    it("spreads a string argument into index keys", () => {
      configureForm("ab" as any);
      // PINNED(quirk): A string is passed to Object.assign, which copies its characters as "0", "1", ... keys. Decide: should non-object arguments throw or be ignored?
      expect(globalConfig).toHaveProperty("0", "a");
      expect(globalConfig).toHaveProperty("1", "b");
    });
  });

  test("types", () => {
    expectTypeOf(configureForm).toBeCallableWith({});
    expectTypeOf(configureForm).toBeCallableWith(true);
    expectTypeOf(configureForm({ allowSubmitInvalid: true })).toEqualTypeOf<Readonly<FormConfig>>();
    expectTypeOf(configureForm(true)).toEqualTypeOf<Readonly<FormConfig>>();

    typeOnly(() => {
      // @ts-expect-error Only `true` resets
      configureForm(false);
      // @ts-expect-error Unknown key
      configureForm({ unknownKey: 1 });
      // @ts-expect-error Wrong value type
      configureForm({ autoFinalizationDelayMs: "1" });
    });
  });
});

describe("Form#config with globalConfig", () => {
  beforeEach(() => {
    resetGlobalConfig();
  });
  afterEach(() => {
    resetGlobalConfig();
  });

  it("reflects globalConfig changes made after the form was created", () => {
    const form = Form.get({});
    const seen: FormConfig[] = [];
    const dispose = reaction(
      () => form.config,
      (config) => seen.push(config)
    );
    try {
      configureForm({ autoFinalizationDelayMs: 1 });
      expect(form.config).toEqual({ ...defaultConfig, autoFinalizationDelayMs: 1 });
      expect(seen).toEqual([{ ...defaultConfig, autoFinalizationDelayMs: 1 }]);
    } finally {
      dispose();
    }
  });

  it("updates canSubmit when globalConfig changes after the form was created", () => {
    const form = Form.get({ field: "" });
    form.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error"));
    expect(form.canSubmit).toBe(false); // invalid
    configureForm({ allowSubmitInvalid: true });
    expect(form.canSubmit).toBe(true);
    configureForm(true);
    expect(form.canSubmit).toBe(false);
  });

  it("prefers local overrides per key while other keys follow globalConfig", () => {
    const form = Form.get({});
    form.configure({ autoFinalizationDelayMs: 1 });
    configureForm({ autoFinalizationDelayMs: 2, allowSubmitInvalid: true });
    expect(form.config).toEqual({ autoFinalizationDelayMs: 1, allowSubmitInvalid: true });
  });

  it("merges successive local overrides", () => {
    const form = Form.get({});
    form.configure({ autoFinalizationDelayMs: 1 });
    form.configure({ allowSubmitInvalid: true });
    expect(form.config).toEqual({ autoFinalizationDelayMs: 1, allowSubmitInvalid: true });
  });

  it("follows the latest globalConfig after resetting the local overrides", () => {
    const form = Form.get({});
    form.configure({ autoFinalizationDelayMs: 1 });
    configureForm({ autoFinalizationDelayMs: 2 });
    form.configure(true);
    expect(form.config.autoFinalizationDelayMs).toBe(2);
  });

  it("does not reset local overrides when globalConfig is reset", () => {
    const form = Form.get({});
    form.configure({ allowSubmitInvalid: true });
    configureForm(true);
    expect(form.config.allowSubmitInvalid).toBe(true);
  });

  it("keeps local overrides independent between forms", () => {
    const form1 = Form.get({});
    const form2 = Form.get({});
    form1.configure({ autoFinalizationDelayMs: 1 });
    expect(form2.config).toEqual(defaultConfig);
    expect(globalConfig).toEqual(defaultConfig);
  });

  it("does not mutate the object passed to Form#configure", () => {
    const form = Form.get({});
    const override = { autoFinalizationDelayMs: 1 };
    form.configure(override);
    form.configure({ allowSubmitInvalid: true });
    expect(override).toStrictEqual({ autoFinalizationDelayMs: 1 });
  });

  it("does not notify observers when the merged config is structurally unchanged", () => {
    const form = Form.get({});
    form.configure({ autoFinalizationDelayMs: 1 });
    const listener = vi.fn();
    const dispose = reaction(() => form.config, listener);
    try {
      configureForm({ autoFinalizationDelayMs: 2 }); // Shadowed by the local override
      form.configure({ autoFinalizationDelayMs: 1 }); // Same value
      expect(listener).not.toHaveBeenCalled();

      configureForm({ allowSubmitInvalid: true });
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      dispose();
    }
  });

  it("lets a local undefined value shadow globalConfig", () => {
    const form = Form.get({});
    form.configure({ autoFinalizationDelayMs: undefined });
    // PINNED(bug): The local override is spread over globalConfig as-is, so an explicit `undefined` replaces the number-typed value. Expected: undefined entries fall back to globalConfig (3000). Flip this assertion when fixing.
    expect(form.config.autoFinalizationDelayMs).toBeUndefined();
  });

  it("resets local overrides when Form#configure receives a non-object at runtime", () => {
    const form = Form.get({});
    form.configure({ autoFinalizationDelayMs: 1 });
    (form.configure as any)(false);
    // PINNED(quirk): Any non-object argument (not only `true`) takes the reset branch. Decide: should only `true` reset, with other values ignored or rejected?
    expect(form.config).toEqual(defaultConfig);
  });

  test("types", () => {
    const form = Form.get({});
    expectTypeOf(form.config).toEqualTypeOf<Readonly<FormConfig>>();
    expectTypeOf(form.configure).toBeCallableWith({ autoFinalizationDelayMs: 1 });
    expectTypeOf(form.configure).toBeCallableWith(true);

    typeOnly(() => {
      // @ts-expect-error Only `true` resets
      form.configure(false);
      // @ts-expect-error Unknown key
      form.configure({ unknownKey: 1 });
    });
  });
});

describe("configureForm (argument handling)", () => {
  beforeEach(() => {
    resetGlobalConfig();
  });
  afterEach(() => {
    resetGlobalConfig();
    expect(Object.keys(globalConfig)).toEqual(configKeys);
  });

  it("resets only for the literal `true`, ignoring other truthy primitives at runtime", () => {
    configureForm({ autoFinalizationDelayMs: 1 });
    configureForm(1 as any);
    configureForm(Symbol("true") as any);
    expect(globalConfig).toEqual({ ...defaultConfig, autoFinalizationDelayMs: 1 });
    expect(Object.keys(globalConfig)).toEqual(configKeys);
  });

  it("copies the values instead of keeping a reference to the argument", () => {
    const config = observable({ autoFinalizationDelayMs: 1 });
    configureForm(config);
    runInAction(() => {
      config.autoFinalizationDelayMs = 2;
    });
    expect(globalConfig.autoFinalizationDelayMs).toBe(1);
  });

  it("ignores properties inherited from the prototype of the argument", () => {
    class ConfigWithGetter {
      get autoFinalizationDelayMs() {
        return 1;
      }
    }
    const config = new ConfigWithGetter();
    // Accepted by the type since the getter structurally matches `Partial<FormConfig>`
    configureForm(config);
    // PINNED(quirk): Object.assign copies own enumerable properties only, so values from getters or prototypes are silently dropped. Decide: should configureForm read the known keys explicitly (so this becomes 1)?
    expect(globalConfig.autoFinalizationDelayMs).toBe(3000);
  });
});

describe("Form#configure (details)", () => {
  class Model {
    a = "";
  }

  beforeEach(() => {
    resetGlobalConfig();
  });
  afterEach(() => {
    resetGlobalConfig();
  });

  it("applies multiple keys in a single batch", () => {
    const form = Form.get(new Model());
    const seen: FormConfig[] = [];
    const dispose = reaction(
      () => form.config,
      (config) => seen.push(config)
    );
    try {
      form.configure({ autoFinalizationDelayMs: 1, allowSubmitInvalid: true });
      expect(seen).toEqual([{ autoFinalizationDelayMs: 1, allowSubmitInvalid: true }]);

      form.configure(true);
      expect(seen).toEqual([{ autoFinalizationDelayMs: 1, allowSubmitInvalid: true }, defaultConfig]);
    } finally {
      dispose();
    }
  });

  it("updates observed values inside an action (no strict-mode warnings), even when detached", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    configureMobx({ enforceActions: "always" });
    const form = Form.get(new Model());
    const dispose = autorun(() => void form.config);
    try {
      const { configure } = form;
      configure({ autoFinalizationDelayMs: 1 });
      expect(form.config.autoFinalizationDelayMs).toBe(1);
      configure(true);
      expect(form.config.autoFinalizationDelayMs).toBe(3000);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      dispose();
      configureMobx({ enforceActions: "observed" });
      warn.mockRestore();
    }
  });

  it("does not notify observers when resetting without local overrides", () => {
    const form = Form.get(new Model());
    const listener = vi.fn();
    const dispose = reaction(() => form.config, listener);
    try {
      form.configure(true);
      form.configure({});
      expect(listener).not.toHaveBeenCalled();
    } finally {
      dispose();
    }
  });

  it("forgets earlier local overrides after a reset (configure, reset, configure)", () => {
    const form = Form.get(new Model());
    form.configure({ autoFinalizationDelayMs: 1 });
    form.configure(true);
    form.configure({ allowSubmitInvalid: true });
    expect(form.config).toEqual({ ...defaultConfig, allowSubmitInvalid: true });

    configureForm({ autoFinalizationDelayMs: 2 });
    expect(form.config).toEqual({ ...defaultConfig, autoFinalizationDelayMs: 2, allowSubmitInvalid: true });
  });

  it("removes unknown local keys on reset", () => {
    const form = Form.get(new Model());
    form.configure({ unknownKey: 1 } as any);
    expect(form.config).toHaveProperty("unknownKey", 1);
    form.configure(true);
    expect(form.config).not.toHaveProperty("unknownKey");
  });

  it("ignores null at runtime while false resets", () => {
    const form = Form.get(new Model());
    form.configure({ autoFinalizationDelayMs: 1 });
    (form.configure as any)(null);
    // PINNED(quirk): `typeof null === "object"`, so null takes the merge branch (a no-op) while `false` resets; configureForm ignores both. Decide: should null and false behave the same way in Form#configure and configureForm?
    expect(form.config.autoFinalizationDelayMs).toBe(1);
  });

  describe("Finalization delay", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("uses the global delay changed after the field was created", () => {
      const form = Form.get(new Model());
      const field = form.getField("a");
      configureForm({ autoFinalizationDelayMs: 100 });

      field.markAsChanged("intermediate");
      vi.advanceTimersByTime(99);
      expect(field.isIntermediate).toBe(true);
      vi.advanceTimersByTime(1);
      expect(field.isIntermediate).toBe(false);
    });

    it("uses the local delay over the global delay", () => {
      const form = Form.get(new Model());
      const field = form.getField("a");
      configureForm({ autoFinalizationDelayMs: 100 });
      form.configure({ autoFinalizationDelayMs: 10 });

      field.markAsChanged("intermediate");
      vi.advanceTimersByTime(9);
      expect(field.isIntermediate).toBe(true);
      vi.advanceTimersByTime(1);
      expect(field.isIntermediate).toBe(false);
    });

    it("reads the delay when the intermediate change is scheduled, not when the timer fires", () => {
      const form = Form.get(new Model());
      const field = form.getField("a");
      form.configure({ autoFinalizationDelayMs: 100 });

      field.markAsChanged("intermediate");
      form.configure({ autoFinalizationDelayMs: 10 });
      vi.advanceTimersByTime(99);
      expect(field.isIntermediate).toBe(true);
      vi.advanceTimersByTime(1);
      expect(field.isIntermediate).toBe(false);

      // The next intermediate change picks up the new delay
      field.markAsChanged("intermediate");
      vi.advanceTimersByTime(10);
      expect(field.isIntermediate).toBe(false);
    });

    it("finalizes almost immediately when the delay is undefined", () => {
      const form = Form.get(new Model());
      const field = form.getField("a");
      form.configure({ autoFinalizationDelayMs: undefined });

      field.markAsChanged("intermediate");
      expect(field.isIntermediate).toBe(true);
      vi.advanceTimersByTime(1);
      // PINNED(bug): The number-typed delay becomes undefined (see "lets a local undefined value shadow globalConfig"), and setTimeout treats it as 0, so intermediate input finalizes immediately. Expected: the global delay (3000) applies and the field is still intermediate here. Flip this assertion when fixing.
      expect(field.isIntermediate).toBe(false);
    });
  });
});
