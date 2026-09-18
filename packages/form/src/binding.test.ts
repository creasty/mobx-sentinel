import { autorun, computed, getDependencyTree, makeObservable, observable, runInAction } from "mobx";
import { randomId } from "./randomId";
import {
  FormBinding,
  FormBindingConstructor,
  FormBindingFunc,
  FormBindingMethod,
  FormBindingMethods,
  getSafeBindingName,
} from "./binding";
import { debugForm, Form } from "./form";
import { FormField } from "./field";

export class SampleFormBinding implements FormBinding {
  readonly id = randomId();

  constructor(private form: Form<any>) {
    this.form = form;
  }

  get props() {
    return {
      bindingId: this.id,
      formId: this.form.id,
    };
  }
}

export class SampleConfigurableFormBinding implements FormBinding {
  readonly id = randomId();

  constructor(
    private form: Form<any>,
    public config: { sample: boolean }
  ) {}

  get props() {
    return {
      bindingId: this.id,
      formId: this.form.id,
      config: this.config,
    };
  }
}

export class SampleFieldBinding implements FormBinding {
  readonly id = randomId();

  constructor(private field: FormField) {}

  get props() {
    return {
      bindingId: this.id,
      fieldName: this.field.fieldName,
    };
  }
}

export class SampleConfigurableFieldBinding implements FormBinding {
  readonly id = randomId();

  constructor(
    private field: FormField,
    public config: { sample: boolean }
  ) {}

  get props() {
    return {
      bindingId: this.id,
      config: this.config,
      fieldName: this.field.fieldName,
    };
  }
}

export class SampleMultiFieldBinding implements FormBinding {
  readonly id = randomId();

  constructor(private fields: FormField[]) {}

  get props() {
    return {
      bindingId: this.id,
      fieldNames: this.fields.map((field) => field.fieldName),
    };
  }
}

export class SampleConfigurableMultiFieldBinding implements FormBinding {
  readonly id = randomId();

  constructor(
    private fields: FormField[],
    public config: { sample: boolean }
  ) {}

  get props() {
    return {
      bindingId: this.id,
      config: this.config,
      fieldNames: this.fields.map((field) => field.fieldName),
    };
  }
}

class SampleModel {
  string = "sample";
}

describe("getSafeBindingName", () => {
  it("returns the same name for the same binding constructor", () => {
    const name1 = getSafeBindingName(SampleFormBinding);
    const name2 = getSafeBindingName(SampleFormBinding);
    expect(name1).toBe(name2);
  });

  it("returns different names for different binding constructors", () => {
    const name1 = getSafeBindingName(SampleFormBinding);
    const name2 = getSafeBindingName(SampleFieldBinding);
    expect(name1).not.toBe(name2);
  });

  it("returns different names for different binding constructors with the same Function.name", () => {
    const SampleFormBinding1 = SampleFormBinding;
    const SampleFormBinding2 = class SampleFormBinding extends SampleFormBinding1 {};

    const name1 = getSafeBindingName(SampleFormBinding1);
    const name2 = getSafeBindingName(SampleFormBinding2);
    expect(SampleFormBinding1.name).toBe(SampleFormBinding2.name);
    expect(name1).not.toBe(name2);
  });
});

describe("FormBindingConstructor", () => {
  test("provides correct type definitions for form and field bindings", () => {
    // For form
    SampleFormBinding satisfies FormBindingConstructor.ForForm;
    SampleConfigurableFormBinding satisfies FormBindingConstructor.ForForm;

    // For field
    SampleFieldBinding satisfies FormBindingConstructor.ForField;
    SampleConfigurableFieldBinding satisfies FormBindingConstructor.ForField;

    // For multi-field
    SampleMultiFieldBinding satisfies FormBindingConstructor.ForMultiField;
    SampleConfigurableMultiFieldBinding satisfies FormBindingConstructor.ForMultiField;

    // Union
    SampleFormBinding satisfies FormBindingConstructor;
    SampleConfigurableFormBinding satisfies FormBindingConstructor;
    SampleFieldBinding satisfies FormBindingConstructor;
    SampleConfigurableFieldBinding satisfies FormBindingConstructor;
    SampleMultiFieldBinding satisfies FormBindingConstructor;
    SampleConfigurableMultiFieldBinding satisfies FormBindingConstructor;
  });
});

describe("FormBindingFunc", () => {
  test("provides correct type definitions for form and field bindings", () => {
    // For form
    const bindForm: FormBindingFunc.ForForm<SampleModel> = () => ({}) as any;
    bindForm(SampleFormBinding);
    bindForm(SampleConfigurableFormBinding, { sample: true });

    // For field
    const bindField: FormBindingFunc.ForField<SampleModel> = () => ({}) as any;
    bindField("string", SampleFieldBinding);
    bindField("string", SampleConfigurableFieldBinding, { sample: true });

    // For multi-field
    const bindMultiField: FormBindingFunc.ForMultiField<SampleModel> = () => ({}) as any;
    bindMultiField(["string"], SampleMultiFieldBinding);
    bindMultiField(["string"], SampleConfigurableMultiFieldBinding, { sample: true });

    // Union
    const bind: FormBindingFunc<SampleModel> = () => ({}) as any;
    bind(SampleFormBinding);
    bind(SampleConfigurableFormBinding, { sample: true });
    bind("string", SampleFieldBinding);
    bind("string", SampleConfigurableFieldBinding, { sample: true });
    bind(["string"], SampleMultiFieldBinding);
    bind(["string"], SampleConfigurableMultiFieldBinding, { sample: true });
  });
});

describe("FormBindingMethod", () => {
  class OptionalKeysFieldBinding implements FormBinding {
    constructor(
      readonly field: FormField,
      public config: { label?: string }
    ) {}

    get props() {
      return { label: this.config.label };
    }
  }

  test("takes the config only for a binding to the form", () => {
    expectTypeOf<Parameters<FormBindingMethod<SampleModel, typeof SampleFormBinding>>>().toEqualTypeOf<
      [config?: FormBindingFunc.Config]
    >();
    expectTypeOf<Parameters<FormBindingMethod<SampleModel, typeof SampleConfigurableFormBinding>>>().toEqualTypeOf<
      [config: { sample: boolean } & FormBindingFunc.Config]
    >();
  });

  test("takes the field name and the config for a binding to a field", () => {
    expectTypeOf<Parameters<FormBindingMethod<SampleModel, typeof SampleFieldBinding>>>().toEqualTypeOf<
      [fieldName: FormField.Name<SampleModel>, config?: FormBindingFunc.Config]
    >();
    expectTypeOf<Parameters<FormBindingMethod<SampleModel, typeof SampleConfigurableFieldBinding>>>().toEqualTypeOf<
      [fieldName: FormField.Name<SampleModel>, config: { sample: boolean } & FormBindingFunc.Config]
    >();
  });

  test("takes the field names and the config for a binding to multiple fields", () => {
    expectTypeOf<Parameters<FormBindingMethod<SampleModel, typeof SampleMultiFieldBinding>>>().toEqualTypeOf<
      [fieldNames: FormField.Name<SampleModel>[], config?: FormBindingFunc.Config]
    >();
    expectTypeOf<
      Parameters<FormBindingMethod<SampleModel, typeof SampleConfigurableMultiFieldBinding>>
    >().toEqualTypeOf<
      [fieldNames: FormField.Name<SampleModel>[], config: { sample: boolean } & FormBindingFunc.Config]
    >();
  });

  test("makes the config optional when an empty object satisfies it", () => {
    // The constructor requires the config, but none of its keys is required
    expectTypeOf<Parameters<FormBindingMethod<SampleModel, typeof OptionalKeysFieldBinding>>>().toEqualTypeOf<
      [fieldName: FormField.Name<SampleModel>, config?: { label?: string } & FormBindingFunc.Config]
    >();
  });

  test("returns the props of the binding", () => {
    expectTypeOf<ReturnType<FormBindingMethod<SampleModel, typeof SampleFormBinding>>>().toEqualTypeOf<
      SampleFormBinding["props"]
    >();
    expectTypeOf<ReturnType<FormBindingMethod<SampleModel, typeof SampleConfigurableFieldBinding>>>().toEqualTypeOf<
      SampleConfigurableFieldBinding["props"]
    >();
    expectTypeOf<ReturnType<FormBindingMethod<SampleModel, typeof SampleMultiFieldBinding>>>().toEqualTypeOf<
      SampleMultiFieldBinding["props"]
    >();
  });

  test("is never for a class that is not a binding", () => {
    expectTypeOf<FormBindingMethod<SampleModel, typeof Date>>().toBeNever();
  });
});

describe("FormBindingMethods", () => {
  type GenericConfig<V extends string = string> = { getter: () => V; setter: (value: V) => void };

  /** A generic binding, whose props are typed by the value of the getter */
  class GenericFieldBinding<V extends string = string> implements FormBinding {
    constructor(
      readonly field: FormField,
      public config: GenericConfig<V>
    ) {}

    get props() {
      return { value: this.config.getter() };
    }
  }

  /** The generic binding after its config gained a required option */
  class LabeledGenericFieldBinding<V extends string = string> extends GenericFieldBinding<V> {
    constructor(
      field: FormField,
      public config: GenericConfig<V> & { label: string }
    ) {
      super(field, config);
    }
  }

  const bindings = {
    bindForm: SampleFormBinding,
    bindField: SampleConfigurableFieldBinding,
    bindFields: SampleMultiFieldBinding,
    bindGeneric: GenericFieldBinding,
  };
  type Bindings = typeof bindings;

  /** The method for GenericFieldBinding, written out to keep the type of its value */
  type GenericMethod<T> = <V extends string>(
    fieldName: FormField.Name<T>,
    config: GenericConfig<V> & FormBindingFunc.Config
  ) => GenericFieldBinding<V>["props"];

  test("derives a method for each binding class", () => {
    type Methods = FormBindingMethods<SampleModel, Bindings>;
    expectTypeOf<keyof Methods>().toEqualTypeOf<"bindForm" | "bindField" | "bindFields" | "bindGeneric">();
    expectTypeOf<Methods["bindForm"]>().toEqualTypeOf<FormBindingMethod<SampleModel, typeof SampleFormBinding>>();
    expectTypeOf<Methods["bindField"]>().toEqualTypeOf<
      FormBindingMethod<SampleModel, typeof SampleConfigurableFieldBinding>
    >();
    expectTypeOf<Methods["bindFields"]>().toEqualTypeOf<
      FormBindingMethod<SampleModel, typeof SampleMultiFieldBinding>
    >();
    // Without an override, the type parameter of a generic binding falls back to its constraint
    expectTypeOf<Parameters<Methods["bindGeneric"]>>().toEqualTypeOf<
      [fieldName: FormField.Name<SampleModel>, config: GenericConfig<string> & FormBindingFunc.Config]
    >();
  });

  test("uses an override as written, keeping its type parameters", () => {
    type Methods = FormBindingMethods<SampleModel, Bindings, { bindGeneric: GenericMethod<SampleModel> }>;
    expectTypeOf<Methods["bindGeneric"]>().toEqualTypeOf<GenericMethod<SampleModel>>();
    expectTypeOf<Methods["bindField"]>().toEqualTypeOf<
      FormBindingMethod<SampleModel, typeof SampleConfigurableFieldBinding>
    >();

    typeOnly(() => {
      const methods = {} as Methods;
      const props = methods.bindGeneric("string", {
        getter: () => "a" as const,
        setter: (v) => expectTypeOf(v).toEqualTypeOf<"a">(),
      });
      expectTypeOf(props.value).toEqualTypeOf<"a">();
      methods.bindGeneric<"a" | "b">("string", { getter: () => "a", setter: () => {} });
      // @ts-expect-error Unknown field, with an explicit type argument
      methods.bindGeneric<"a">("unknown", { getter: () => "a", setter: () => {} });
    });
  });

  test("accepts an override written with the binding's own types, in any equivalent form", () => {
    type Config<V extends string> = GenericConfig<V> & FormBindingFunc.Config;
    typeOnly(() => {
      type Reordered = FormBindingMethods<
        SampleModel,
        Bindings,
        {
          bindGeneric: <V extends string>(
            fieldName: FormField.Name<SampleModel>,
            config: FormBindingFunc.Config & GenericConfig<V>
          ) => GenericFieldBinding<V>["props"];
        }
      >;
      type Aliased = FormBindingMethods<
        SampleModel,
        Bindings,
        {
          bindGeneric: <V extends string>(
            fieldName: FormField.Name<SampleModel>,
            config: Config<V>
          ) => GenericFieldBinding<V>["props"];
        }
      >;
      type ReturnWrittenOut = FormBindingMethods<
        SampleModel,
        Bindings,
        {
          bindGeneric: <V extends string>(fieldName: FormField.Name<SampleModel>, config: Config<V>) => { value: V };
        }
      >;
      // An exact copy of the config passes while it matches, and fails once the binding's config changes (see below)
      type CopiedConfig = FormBindingMethods<
        SampleModel,
        Bindings,
        {
          bindGeneric: <V extends string>(
            fieldName: FormField.Name<SampleModel>,
            config: { getter: () => V; setter: (value: V) => void } & FormBindingFunc.Config
          ) => GenericFieldBinding<V>["props"];
        }
      >;
      void ({} as [Reordered, Aliased, ReturnWrittenOut, CopiedConfig]);
    });
  });

  test("rejects an override that diverges from the binding", () => {
    typeOnly(() => {
      // @ts-expect-error No binding for the override
      type Misspelled = FormBindingMethods<SampleModel, Bindings, { bindGenric: GenericMethod<SampleModel> }>;
      type WrongConfig = FormBindingMethods<
        SampleModel,
        Bindings,
        // @ts-expect-error The config of another binding
        {
          bindGeneric: <V extends string>(
            fieldName: FormField.Name<SampleModel>,
            config: { sample: boolean } & FormBindingFunc.Config
          ) => GenericFieldBinding<V>["props"];
        }
      >;
      type WrongSubject = FormBindingMethods<
        SampleModel,
        Bindings,
        // @ts-expect-error A list of field names for a binding to a field
        {
          bindGeneric: <V extends string>(
            fieldNames: FormField.Name<SampleModel>[],
            config: GenericConfig<V> & FormBindingFunc.Config
          ) => GenericFieldBinding<V>["props"];
        }
      >;
      type WrongProps = FormBindingMethods<
        SampleModel,
        Bindings,
        // @ts-expect-error The props of another binding
        {
          bindGeneric: <V extends string>(
            fieldName: FormField.Name<SampleModel>,
            config: GenericConfig<V> & FormBindingFunc.Config
          ) => SampleFieldBinding["props"];
        }
      >;
      type LooseFieldName = FormBindingMethods<
        SampleModel,
        Bindings,
        // @ts-expect-error Looser than the binding: any string for the field name
        {
          bindGeneric: <V extends string>(
            fieldName: string,
            config: GenericConfig<V> & FormBindingFunc.Config
          ) => GenericFieldBinding<V>["props"];
        }
      >;
      type StaleConfig = FormBindingMethods<
        SampleModel,
        { bindGeneric: typeof LabeledGenericFieldBinding },
        // @ts-expect-error The config from before the binding required `label`
        {
          bindGeneric: <V extends string>(
            fieldName: FormField.Name<SampleModel>,
            config: GenericConfig<V> & FormBindingFunc.Config
          ) => GenericFieldBinding<V>["props"];
        }
      >;
      void ({} as [Misspelled, WrongConfig, WrongSubject, WrongProps, LooseFieldName, StaleConfig]);
    });
  });

  test("rejects a class that is not a binding", () => {
    typeOnly(() => {
      // @ts-expect-error Not a binding class
      type NotBinding = FormBindingMethods<SampleModel, { bindDate: typeof Date }>;
      void ({} as NotBinding);
    });
  });
});

/** The random id that getSafeBindingName appends */
const randomIdPattern = "[0-9a-f]{32}";

/** Wraps type-level assertions that must (or must not) compile; the callback is never executed */
function typeOnly(_fn: () => void) {}

class BindModel {
  a = "";
  b = "";
}

/** A binding whose constructor accepts both a single field and multiple fields */
class EitherFieldBinding implements FormBinding {
  readonly id = randomId();

  constructor(
    readonly target: FormField | FormField[],
    public config?: FormBindingFunc.Config
  ) {}

  get props() {
    return {
      bindingId: this.id,
      isMulti: Array.isArray(this.target),
    };
  }
}

class FieldCaptureBinding implements FormBinding {
  constructor(readonly field: FormField) {}

  get props() {
    return { field: this.field };
  }
}

class FieldsCaptureBinding implements FormBinding {
  constructor(readonly fields: FormField[]) {}

  get props() {
    return { fields: this.fields };
  }
}

class FormCaptureBinding implements FormBinding {
  constructor(readonly form: Form<any>) {}

  get props() {
    return { form: this.form };
  }
}

describe("getSafeBindingName (details)", () => {
  it("formats the name as `<Function.name>--<random id>`", () => {
    expect(getSafeBindingName(SampleMultiFieldBinding)).toMatch(
      new RegExp(`^SampleMultiFieldBinding--${randomIdPattern}$`)
    );
  });

  it("uses an empty prefix for anonymous classes", () => {
    const Anonymous = (() =>
      class {
        get props() {
          return {};
        }
      })();
    expect(Anonymous.name).toBe("");
    expect(getSafeBindingName(Anonymous)).toMatch(new RegExp(`^--${randomIdPattern}$`));
  });

  it("reads Function.name only on the first call", () => {
    class Original implements FormBinding {
      get props() {
        return {};
      }
    }
    Object.defineProperty(Original, "name", { value: "Renamed" });
    const name = getSafeBindingName(Original);
    expect(name).toMatch(new RegExp(`^Renamed--${randomIdPattern}$`));

    Object.defineProperty(Original, "name", { value: "RenamedAgain" });
    expect(getSafeBindingName(Original)).toBe(name);
  });

  it("does not add properties to the binding class", () => {
    class Plain implements FormBinding {
      get props() {
        return {};
      }
    }
    const before = Object.getOwnPropertyNames(Plain).sort();
    getSafeBindingName(Plain);
    expect(Object.getOwnPropertyNames(Plain).sort()).toEqual(before);
  });

  it("does not inherit the cached name from the parent class", () => {
    class Parent extends SampleFormBinding {}
    class Child extends Parent {}
    const parentName = getSafeBindingName(Parent);
    const childName = getSafeBindingName(Child);
    expect(parentName).toMatch(new RegExp(`^Parent--${randomIdPattern}$`));
    expect(childName).toMatch(new RegExp(`^Child--${randomIdPattern}$`));
    expect(getSafeBindingName(Parent)).toBe(parentName);
  });

  it("throws a TypeError for a nullish binding class", () => {
    expect(() => getSafeBindingName(null as any)).toThrow(TypeError);
    expect(() => getSafeBindingName(undefined as any)).toThrow(TypeError);
  });

  test("types", () => {
    expectTypeOf(getSafeBindingName).parameters.toEqualTypeOf<[FormBindingConstructor]>();
    expectTypeOf(getSafeBindingName).returns.toEqualTypeOf<string>();

    typeOnly(() => {
      // @ts-expect-error A class without `props` is not a binding
      getSafeBindingName(class {});
    });
  });
});

describe("FormBindingConstructor (details)", () => {
  test("rejects classes that are not bindings", () => {
    class NoProps {}
    class ThreeArgs implements FormBinding {
      readonly extra: number;
      constructor(_field: FormField, _config: object, extra: number) {
        this.extra = extra;
      }
      get props() {
        return {};
      }
    }

    typeOnly(() => {
      // @ts-expect-error `props` is missing
      NoProps satisfies FormBindingConstructor;
      // @ts-expect-error The constructor requires more than two arguments
      ThreeArgs satisfies FormBindingConstructor.ForField;
    });
  });

  test("allows a class to be a field binding and a multi-field binding at the same time", () => {
    EitherFieldBinding satisfies FormBindingConstructor.ForField;
    EitherFieldBinding satisfies FormBindingConstructor.ForMultiField;
  });
});

describe("Form#bind (binding key and cache)", () => {
  const createForm = () => Form.get(new BindModel());
  const bindingKeys = (form: Form<any>) => [...debugForm(form).bindings.keys()];

  describe("Binding key", () => {
    it("consists of the binding name and the cacheKey for form bindings", () => {
      const form = createForm();
      const name = getSafeBindingName(SampleFormBinding);

      form.bind(SampleFormBinding);
      form.bind(SampleFormBinding, { cacheKey: "key" });
      // The `undefined` suffix for a missing cacheKey causes the collision pinned in "Binding key collisions"
      expect(bindingKeys(form)).toEqual([`${name}:undefined`, `${name}:key`]);
    });

    it("consists of the field name, the binding name, and the cacheKey for field bindings", () => {
      const form = createForm();
      const name = getSafeBindingName(SampleFieldBinding);

      form.bind("a", SampleFieldBinding);
      form.bind("a", SampleFieldBinding, { cacheKey: "key" });
      form.bind("a:suffix", SampleFieldBinding);
      expect(bindingKeys(form)).toEqual([`a@${name}:undefined`, `a@${name}:key`, `a:suffix@${name}:undefined`]);
    });

    it("consists of the comma-joined field names, the binding name, and the cacheKey for multi-field bindings", () => {
      const form = createForm();
      const name = getSafeBindingName(SampleMultiFieldBinding);

      form.bind(["a", "b"], SampleMultiFieldBinding);
      form.bind(["a", "b"], SampleMultiFieldBinding, { cacheKey: "key" });
      form.bind([], SampleMultiFieldBinding);
      expect(bindingKeys(form)).toEqual([`a,b@${name}:undefined`, `a,b@${name}:key`, `@${name}:undefined`]);
    });
  });

  describe("Distinct instances", () => {
    it("creates separate instances for different cacheKeys", () => {
      const form = createForm();
      const none = form.bind(SampleFormBinding);
      const key1 = form.bind(SampleFormBinding, { cacheKey: "key1" });
      const key2 = form.bind(SampleFormBinding, { cacheKey: "key2" });
      expect(new Set([none.bindingId, key1.bindingId, key2.bindingId]).size).toBe(3);
      expect(form.bind(SampleFormBinding, { cacheKey: "key1" }).bindingId).toBe(key1.bindingId);
    });

    it("treats an empty-string cacheKey as distinct from no cacheKey", () => {
      const form = createForm();
      const none = form.bind(SampleFormBinding);
      const empty = form.bind(SampleFormBinding, { cacheKey: "" });
      expect(empty.bindingId).not.toBe(none.bindingId);
    });

    it("creates separate instances for different fields", () => {
      const form = createForm();
      const a = form.bind("a", SampleFieldBinding);
      const b = form.bind("b", SampleFieldBinding);
      expect(a.bindingId).not.toBe(b.bindingId);
      expect(b.fieldName).toBe("b");
    });

    it("creates separate instances for a field name and its augmented name", () => {
      const form = createForm();
      const plain = form.bind("a", SampleFieldBinding);
      const augmented = form.bind("a:suffix", SampleFieldBinding);
      expect(augmented.bindingId).not.toBe(plain.bindingId);
      expect(augmented.fieldName).toBe("a:suffix");
    });

    it("creates separate instances for different binding classes on the same subject", () => {
      const form = createForm();
      const plain = form.bind("a", SampleFieldBinding);
      const configurable = form.bind("a", SampleConfigurableFieldBinding, { sample: true });
      expect(configurable.bindingId).not.toBe(plain.bindingId);
    });

    it("creates separate instances for different classes sharing the same Function.name", () => {
      const Original = SampleFormBinding;
      const Shadow = class SampleFormBinding extends Original {};
      const form = createForm();
      expect(form.bind(Shadow).bindingId).not.toBe(form.bind(Original).bindingId);
    });

    it("creates separate instances for different field orders", () => {
      const form = createForm();
      const ab = form.bind(["a", "b"], SampleMultiFieldBinding);
      const ba = form.bind(["b", "a"], SampleMultiFieldBinding);
      expect(ba.bindingId).not.toBe(ab.bindingId);
      expect(ba.fieldNames).toEqual(["b", "a"]);
    });

    it("keeps separate caches per form instance, including forms with a formKey", () => {
      const model = new BindModel();
      const form = Form.get(model);
      const keyedForm = Form.get(model, Symbol("key"));
      expect(keyedForm.bind(SampleFormBinding).bindingId).not.toBe(form.bind(SampleFormBinding).bindingId);
      expect(debugForm(form).bindings.size).toBe(1);
      expect(debugForm(keyedForm).bindings.size).toBe(1);
    });
  });

  describe("Binding key collisions", () => {
    it('shares an instance between `cacheKey: "undefined"` and no cacheKey', () => {
      const form = createForm();
      const none = form.bind(SampleFormBinding);
      const literal = form.bind(SampleFormBinding, { cacheKey: "undefined" });
      // PINNED(bug): The absent cacheKey is stringified as "undefined", so it collides with the literal cacheKey "undefined". Expected: distinct instances, as the docs define the user-specified key as a component of the binding key. Flip this assertion when fixing.
      expect(literal.bindingId).toBe(none.bindingId);
    });

    it("shares an instance between a single-field binding and a one-element multi-field binding of the same class", () => {
      const form = createForm();
      const single = form.bind("a", EitherFieldBinding);
      const multi = form.bind(["a"], EitherFieldBinding);
      // PINNED(bug): Both produce the key `a@<name>:undefined`, so the multi-field call returns the instance constructed with a single FormField. Expected: distinct instances, as the docs list the subject (a single field vs multiple fields) as a component of the binding key. Flip these assertions when fixing.
      expect(multi.bindingId).toBe(single.bindingId);
      expect(multi.isMulti).toBe(false);
    });

    it("shares an instance between multi-field bindings whose comma-joined names coincide", () => {
      const form = createForm();
      const twoFields = form.bind(["a:x", "b"], FieldsCaptureBinding);
      // "a:x,b" is a valid augmented name of the field "a"
      const oneField = form.bind(["a:x,b"], FieldsCaptureBinding);
      // PINNED(bug): Field names are joined with "," without escaping, so ["a:x,b"] and ["a:x", "b"] produce the same key and the second call receives the fields of the first. Expected: a separate instance bound to the single field "a:x,b". Flip these assertions when fixing.
      expect(oneField.fields).toBe(twoFields.fields);
      expect(oneField.fields.map((field) => field.fieldName)).toEqual(["a:x", "b"]);
    });
  });

  describe("Construction", () => {
    it("constructs the binding lazily and only once per binding key", () => {
      let constructed = 0;
      class CountingBinding implements FormBinding {
        constructor(readonly form: Form<any>) {
          constructed++;
        }
        get props() {
          return {};
        }
      }

      const form = createForm();
      expect(constructed).toBe(0);
      form.bind(CountingBinding);
      form.bind(CountingBinding);
      form.bind(CountingBinding);
      expect(constructed).toBe(1);
      form.bind(CountingBinding, { cacheKey: "other" });
      expect(constructed).toBe(2);
    });

    it("passes the form itself to form bindings without creating fields", () => {
      const form = createForm();
      expect(form.bind(FormCaptureBinding).form).toBe(form);
      expect(debugForm(form).fields.size).toBe(0);
    });

    it("passes the cached FormField instances to field and multi-field bindings", () => {
      const form = createForm();
      const { field } = form.bind("a", FieldCaptureBinding);
      const { fields } = form.bind(["a", "b"], FieldsCaptureBinding);
      expect(field).toBe(form.getField("a"));
      expect(fields).toHaveLength(2);
      expect(fields[0]).toBe(form.getField("a"));
      expect(fields[1]).toBe(form.getField("b"));
      expect([...debugForm(form).fields.keys()]).toEqual(["a", "b"]);
    });

    it("passes the same FormField twice for duplicate field names", () => {
      const form = createForm();
      const { fields } = form.bind(["a", "a"], FieldsCaptureBinding);
      expect(fields).toHaveLength(2);
      expect(fields[0]).toBe(fields[1]);
    });

    it("passes an empty array for an empty field list", () => {
      const form = createForm();
      expect(form.bind([], FieldsCaptureBinding).fields).toEqual([]);
      expect(debugForm(form).fields.size).toBe(0);
    });

    it("passes the config object by reference, including the cacheKey", () => {
      const form = createForm();
      const config = { sample: true, cacheKey: "key" };
      const props = form.bind(SampleConfigurableFormBinding, config);
      expect(props.config).toBe(config);
      expect(props.config).toEqual({ sample: true, cacheKey: "key" });
    });

    it("does not cache a binding whose constructor throws", () => {
      let shouldThrow = true;
      let constructed = 0;
      class FlakyBinding implements FormBinding {
        readonly count: number;
        constructor(_form: Form<any>) {
          if (shouldThrow) throw new Error("constructor failed");
          this.count = ++constructed;
        }
        get props() {
          return { count: this.count };
        }
      }

      const form = createForm();
      expect(() => form.bind(FlakyBinding)).toThrow("constructor failed");
      expect(debugForm(form).bindings.size).toBe(0);

      shouldThrow = false;
      expect(form.bind(FlakyBinding)).toEqual({ count: 1 });
      expect(form.bind(FlakyBinding)).toEqual({ count: 1 });
    });

    it("throws a TypeError without touching the caches when the binding class is missing", () => {
      const form = createForm();
      expect(() => (form.bind as any)(null)).toThrow(TypeError);
      expect(() => (form.bind as any)("a", undefined)).toThrow(TypeError);
      expect(() => (form.bind as any)(["a", "b"], undefined)).toThrow(TypeError);
      expect(debugForm(form).bindings.size).toBe(0);
      expect(debugForm(form).fields.size).toBe(0);
    });
  });

  describe("Config updates", () => {
    it("replaces the config with the latest object on every call", () => {
      const form = createForm();
      const config1 = { sample: true };
      const config2 = { sample: true };
      form.bind("a", SampleConfigurableFieldBinding, config1);
      expect(form.bind("a", SampleConfigurableFieldBinding, config2).config).toBe(config2);
    });

    it("replaces the config with undefined when it is omitted on a later call", () => {
      const form = createForm();
      const first = form.bind(["a"], SampleConfigurableMultiFieldBinding, { sample: true });
      const second = form.bind(["a"], SampleConfigurableMultiFieldBinding, undefined as any);
      expect(second.bindingId).toBe(first.bindingId);
      expect(second.config).toBeUndefined();
    });

    it("assigns `config` as an own property even on bindings that declare none", () => {
      const form = createForm();
      form.bind(SampleFormBinding);
      const [instance] = debugForm(form).bindings.values();
      expect(instance).toBeInstanceOf(SampleFormBinding);
      expect(Object.hasOwn(instance, "config")).toBe(true);
      expect(instance.config).toBeUndefined();
    });
  });

  describe("Props", () => {
    it("re-evaluates props on every call instead of caching them", () => {
      const form = createForm();
      const props1 = form.bind(SampleFormBinding);
      const props2 = form.bind(SampleFormBinding);
      expect(props2).not.toBe(props1);
      expect(props2).toEqual(props1);
    });

    it("does not make the calling derivation depend on the binding cache", () => {
      const form = createForm();
      const dispose = autorun(() => {
        form.bind(SampleFormBinding);
        form.bind("a", SampleFieldBinding);
        form.bind(["a", "b"], SampleMultiFieldBinding);
      });
      try {
        expect(getDependencyTree(dispose).dependencies).toBeUndefined();
      } finally {
        dispose();
      }
    });
  });

  describe("Types", () => {
    test("infers the props type of the binding", () => {
      const form = createForm();
      expectTypeOf(form.bind).toEqualTypeOf<FormBindingFunc<BindModel>>();
      expectTypeOf(form.bind(SampleFormBinding)).toEqualTypeOf<{ bindingId: string; formId: string }>();
      expectTypeOf(form.bind("a", SampleFieldBinding)).toEqualTypeOf<{ bindingId: string; fieldName: string }>();
      expectTypeOf(form.bind(["a"], SampleMultiFieldBinding)).toEqualTypeOf<{
        bindingId: string;
        fieldNames: string[];
      }>();
      expectTypeOf(form.bind(SampleConfigurableFormBinding, { sample: true })).toEqualTypeOf<{
        bindingId: string;
        formId: string;
        config: { sample: boolean };
      }>();
    });

    test("accepts strict and augmented field names only", () => {
      const form = createForm();
      typeOnly(() => {
        form.bind("a", SampleFieldBinding);
        form.bind("a:suffix", SampleFieldBinding);
        form.bind(["a", "b:suffix"], SampleMultiFieldBinding);
        // @ts-expect-error Not a field of BindModel
        form.bind("unknown", SampleFieldBinding);
        // @ts-expect-error Augmented names require a known field as the prefix
        form.bind("unknown:suffix", SampleFieldBinding);
        // @ts-expect-error Not a field of BindModel
        form.bind(["a", "unknown"], SampleMultiFieldBinding);
      });
    });

    test("rejects binding classes made for a different subject", () => {
      const form = createForm();
      typeOnly(() => {
        // @ts-expect-error Field binding to the form
        form.bind(SampleFieldBinding);
        // @ts-expect-error Form binding to a field
        form.bind("a", SampleFormBinding);
        // @ts-expect-error Field binding to multiple fields
        form.bind(["a"], SampleFieldBinding);
        // @ts-expect-error Multi-field binding to a field
        form.bind("a", SampleMultiFieldBinding);
        // @ts-expect-error Form binding to multiple fields
        form.bind(["a"], SampleFormBinding);
      });
    });

    test("requires the config for bindings with a required config", () => {
      const form = createForm();
      typeOnly(() => {
        // @ts-expect-error Config is required
        form.bind(SampleConfigurableFormBinding);
        // @ts-expect-error Config is required
        form.bind("a", SampleConfigurableFieldBinding);
        // @ts-expect-error Config is required
        form.bind(["a"], SampleConfigurableMultiFieldBinding);
      });
    });

    test("checks the shape of the config", () => {
      const form = createForm();
      typeOnly(() => {
        // @ts-expect-error Wrong value type
        form.bind(SampleConfigurableFormBinding, { sample: "yes" });
        // @ts-expect-error cacheKey must be a string
        form.bind(SampleFormBinding, { cacheKey: 1 });
        // @ts-expect-error Unknown property
        form.bind(SampleConfigurableFormBinding, { sample: true, extra: 1 });
        // @ts-expect-error Unknown property on a binding without a config
        form.bind(SampleFormBinding, { extra: 1 });
      });
    });
  });
});

describe("Form#bind (constructor, lifecycle, and misuse)", () => {
  const createForm = () => Form.get(new BindModel());

  /** Records the arguments each constructor received, before `Form#bind` touches the instance */
  class ConstructorArgsFormBinding implements FormBinding {
    readonly configAtConstruction: unknown;
    constructor(
      readonly form: Form<any>,
      public config?: FormBindingFunc.Config & { sample?: boolean }
    ) {
      this.configAtConstruction = config;
    }
    get props() {
      return { configAtConstruction: this.configAtConstruction, config: this.config };
    }
  }
  class ConstructorArgsFieldBinding implements FormBinding {
    readonly configAtConstruction: unknown;
    constructor(
      readonly field: FormField,
      public config?: FormBindingFunc.Config & { sample?: boolean }
    ) {
      this.configAtConstruction = config;
    }
    get props() {
      return { configAtConstruction: this.configAtConstruction, config: this.config };
    }
  }
  class ConstructorArgsMultiFieldBinding implements FormBinding {
    readonly configAtConstruction: unknown;
    constructor(
      readonly fields: FormField[],
      public config?: FormBindingFunc.Config & { sample?: boolean }
    ) {
      this.configAtConstruction = config;
    }
    get props() {
      return { configAtConstruction: this.configAtConstruction, config: this.config, fields: this.fields };
    }
  }

  describe("Constructor arguments", () => {
    it("passes the config to the constructor of form bindings", () => {
      const form = createForm();
      const config = { sample: true };
      expect(form.bind(ConstructorArgsFormBinding, config).configAtConstruction).toBe(config);
    });

    it("passes the config to the constructor of field bindings", () => {
      const form = createForm();
      const config = { sample: true };
      expect(form.bind("a", ConstructorArgsFieldBinding, config).configAtConstruction).toBe(config);
    });

    it("passes the config to the constructor of multi-field bindings", () => {
      const form = createForm();
      const config = { sample: true };
      expect(form.bind(["a", "b"], ConstructorArgsMultiFieldBinding, config).configAtConstruction).toBe(config);
    });

    it("keeps the config given at construction while exposing the latest one as `config`", () => {
      const form = createForm();
      const first = { sample: true };
      const second = { sample: false };
      form.bind("a", ConstructorArgsFieldBinding, first);
      const props = form.bind("a", ConstructorArgsFieldBinding, second);
      expect(props.configAtConstruction).toBe(first);
      expect(props.config).toBe(second);
    });

    it("ignores arguments after the config", () => {
      const form = createForm();
      const config = { sample: true };
      const props = (form.bind as any)(ConstructorArgsFormBinding, config, { sample: false });
      expect(props.config).toBe(config);
    });

    it("reads the field names at call time, so mutating the caller's array later creates a new binding", () => {
      const form = createForm();
      const fieldNames: ("a" | "b")[] = ["a"];
      const first = form.bind(fieldNames, ConstructorArgsMultiFieldBinding);

      // Mutating the caller's array changes the key on the next call, but not the existing binding
      fieldNames.push("b");
      const second = form.bind(fieldNames, ConstructorArgsMultiFieldBinding);
      expect(second.fields).not.toBe(first.fields);
      expect(first.fields.map((field) => field.fieldName)).toEqual(["a"]);
      expect(second.fields.map((field) => field.fieldName)).toEqual(["a", "b"]);
      expect(debugForm(form).bindings.size).toBe(2);
    });

    it("creates the field even when the constructor of a field binding throws", () => {
      class ThrowingFieldBinding implements FormBinding {
        constructor(_field: FormField) {
          throw new Error("constructor failed");
        }
        get props() {
          return {};
        }
      }

      const form = createForm();
      expect(() => form.bind("a", ThrowingFieldBinding)).toThrow("constructor failed");
      expect(() => form.bind(["b"], ThrowingFieldBinding as any)).toThrow("constructor failed");
      expect(debugForm(form).bindings.size).toBe(0);
      expect([...debugForm(form).fields.keys()]).toEqual(["a", "b"]);
    });
  });

  describe("Config assignment", () => {
    it("overwrites a config normalized by the constructor, even on the first call", () => {
      class DefaultingBinding implements FormBinding {
        config?: { sample: boolean };
        constructor(_form: Form<any>, config?: { sample?: boolean }) {
          this.config = { sample: false, ...config };
        }
        get props() {
          return { config: this.config };
        }
      }

      const form = createForm();
      const config = { cacheKey: "key" };
      // PINNED(quirk): The raw config is assigned right after construction, so defaults applied in the constructor are lost immediately. Decide: should the first call skip the assignment (or should bindings be told to derive defaults in getters)?
      expect(form.bind(DefaultingBinding, config).config).toBe(config);
      expect(form.bind(DefaultingBinding).config).toBeUndefined();
    });

    it("throws after caching the instance when `config` cannot be assigned", () => {
      let constructed = 0;
      class GetterConfigBinding implements FormBinding {
        constructor(_form: Form<any>) {
          constructed++;
        }
        get config() {
          return undefined;
        }
        get props() {
          return {};
        }
      }

      const form = createForm();
      // PINNED(quirk): `instance.config = config` runs on a class whose `config` is a getter, which throws in strict mode; the instance was already cached, so every later call throws too. Decide: should Form#bind guard the assignment (or should the type forbid a read-only `config`)?
      expect(() => form.bind(GetterConfigBinding)).toThrow(TypeError);
      expect(() => form.bind(GetterConfigBinding)).toThrow(TypeError);
      expect(constructed).toBe(1);
      expect(debugForm(form).bindings.size).toBe(1);
    });

    it("lets a plain getter read the config of the latest call while observed", () => {
      // The documented pattern: members that read `this.config` are plain getters, as `props` is
      class GetterPropsBinding implements FormBinding {
        constructor(
          readonly form: Form<any>,
          public config: { label: string }
        ) {}
        get label() {
          return this.config.label;
        }
        get props() {
          return { label: this.label };
        }
      }

      const form = createForm();
      const label = observable.box("first");
      const seen: string[] = [];
      const dispose = autorun(() => {
        seen.push(form.bind(GetterPropsBinding, { label: label.get() }).label);
      });
      try {
        runInAction(() => label.set("second"));
        expect(seen).toEqual(["first", "second"]);
      } finally {
        dispose();
      }
    });

    it("keeps a computed member that reads config on the first config while observed", () => {
      // Why the docs advise against @computed for members that read `this.config`
      class ComputedPropsBinding implements FormBinding {
        constructor(
          readonly form: Form<any>,
          public config: { label: string }
        ) {
          makeObservable(this, { label: computed });
        }
        get label() {
          return this.config.label;
        }
        get props() {
          return { label: this.label };
        }
      }

      const form = createForm();
      const label = observable.box("first");
      const seen: string[] = [];
      const dispose = autorun(() => {
        seen.push(form.bind(ComputedPropsBinding, { label: label.get() }).label);
      });
      try {
        runInAction(() => label.set("second"));
        // `config` is assigned as a plain property, so nothing tells the computed that it was replaced
        expect(seen).toEqual(["first", "first"]);
      } finally {
        dispose();
      }
      // Outside a derivation the computed is not cached, so the latest config is read
      expect(form.bind(ComputedPropsBinding, { label: "third" }).label).toBe("third");
    });
  });

  describe("Cache lifetime", () => {
    it("shares the cache between calls of Form.get for the same subject", () => {
      const model = new BindModel();
      expect(Form.get(model).bind(SampleFormBinding).bindingId).toBe(Form.get(model).bind(SampleFormBinding).bindingId);
    });

    it("keeps cached bindings across Form#reset", () => {
      const form = createForm();
      const before = form.bind("a", SampleFieldBinding);
      form.reset();
      expect(form.bind("a", SampleFieldBinding).bindingId).toBe(before.bindingId);
    });

    it("retains a binding for every distinct cacheKey ever used", () => {
      const form = createForm();
      for (let i = 0; i < 100; i++) {
        form.bind(SampleFormBinding, { cacheKey: String(i) });
      }
      // The cache has no eviction or release API; bindings live as long as the form ("Bindings are cached and reused")
      expect(debugForm(form).bindings.size).toBe(100);
    });
  });

  describe("Types", () => {
    class OptionalConfigFieldBinding implements FormBinding {
      constructor(
        readonly field: FormField,
        public config?: { label?: string }
      ) {}
      get props() {
        return { label: this.config?.label };
      }
    }

    class OtherModelFormBinding implements FormBinding {
      constructor(readonly form: Form<{ other: number }>) {}
      get props() {
        return {};
      }
    }

    test("describes the FormBinding interface and the bind config", () => {
      expectTypeOf<FormBinding>().toEqualTypeOf<{ config?: object; readonly props: object }>();
      expectTypeOf<FormBindingFunc.Config>().toEqualTypeOf<{ cacheKey?: string }>();
      expectTypeOf<FormBindingConstructor>().toEqualTypeOf<
        FormBindingConstructor.ForField | FormBindingConstructor.ForMultiField | FormBindingConstructor.ForForm
      >();
    });

    test("accepts an optional config with or without the config argument", () => {
      const form = createForm();
      expectTypeOf(form.bind("a", OptionalConfigFieldBinding)).toEqualTypeOf<{ label: string | undefined }>();
      typeOnly(() => {
        form.bind("a", OptionalConfigFieldBinding, {});
        form.bind("a", OptionalConfigFieldBinding, { label: "x" });
        form.bind("a", OptionalConfigFieldBinding, { label: "x", cacheKey: "key" });
        // @ts-expect-error Wrong value type
        form.bind("a", OptionalConfigFieldBinding, { label: 1 });
      });
    });

    test("rejects a form binding typed for a different model", () => {
      const form = createForm();
      typeOnly(() => {
        // @ts-expect-error Form<{ other: number }> is not Form<BindModel>
        form.bind(OtherModelFormBinding);
      });
    });
  });
});
