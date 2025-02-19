import { v4 as uuidV4 } from "uuid";
import {
  FormBinding,
  FormBindingConstructor,
  FormBindingFunc,
  FormBindingFuncExtension,
  getSafeBindingName,
} from "./binding";
import { Form } from "./form";
import { FormField } from "./field";

export class SampleFormBinding implements FormBinding {
  readonly id = uuidV4();

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
  readonly id = uuidV4();

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
  readonly id = uuidV4();

  constructor(private field: FormField) {}

  get props() {
    return {
      bindingId: this.id,
      fieldName: this.field.fieldName,
    };
  }
}

export class SampleConfigurableFieldBinding implements FormBinding {
  readonly id = uuidV4();

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
  readonly id = uuidV4();

  constructor(private fields: FormField[]) {}

  get props() {
    return {
      bindingId: this.id,
      fieldNames: this.fields.map((field) => field.fieldName),
    };
  }
}

export class SampleConfigurableMultiFieldBinding implements FormBinding {
  readonly id = uuidV4();

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

describe("FormBindingFuncExtension", () => {
  test("provides correct type definitions for form and field bindings", () => {
    const bindForm1: FormBindingFuncExtension.ForForm.OptionalConfig<SampleModel, typeof SampleFormBinding> = () =>
      ({}) as any;
    bindForm1();
    bindForm1({});
    bindForm1({ cacheKey: "key" });

    const bindForm2: FormBindingFuncExtension.ForForm.RequiredConfig<SampleModel, typeof SampleFormBinding> = () =>
      ({}) as any;
    // @ts-expect-error Expected 1 arguments, but got 0
    bindForm2();
    bindForm2({});
    bindForm2({ cacheKey: "key" });

    const bindForm3: FormBindingFuncExtension.ForForm.OptionalConfig<
      SampleModel,
      typeof SampleConfigurableFormBinding
    > = () => ({}) as any;
    bindForm3();
    // @ts-expect-error Property 'sample' is missing
    bindForm3({});
    bindForm3({ sample: true });
    bindForm3({ sample: true, cacheKey: "key" });

    const bindForm4: FormBindingFuncExtension.ForForm.RequiredConfig<
      SampleModel,
      typeof SampleConfigurableFormBinding
    > = () => ({}) as any;
    // @ts-expect-error Expected 1 arguments, but got 0
    bindForm4();
    // @ts-expect-error Property 'sample' is missing
    bindForm4({});
    bindForm4({ sample: true });
    bindForm4({ sample: true, cacheKey: "key" });

    const bindField1: FormBindingFuncExtension.ForField.OptionalConfig<SampleModel, typeof SampleFieldBinding> = () =>
      ({}) as any;
    bindField1("string");
    bindField1("string", {});
    bindField1("string", { cacheKey: "key" });

    const bindField2: FormBindingFuncExtension.ForField.RequiredConfig<SampleModel, typeof SampleFieldBinding> = () =>
      ({}) as any;
    // @ts-expect-error Expected 2 arguments, but got 1
    bindField2("string");
    bindField2("string", {});
    bindField2("string", { cacheKey: "key" });

    const bindField3: FormBindingFuncExtension.ForField.OptionalConfig<
      SampleModel,
      typeof SampleConfigurableFieldBinding
    > = () => ({}) as any;
    bindField3("string");
    // @ts-expect-error Property 'sample' is missing
    bindField3("string", {});
    bindField3("string", { sample: true });
    bindField3("string", { sample: true, cacheKey: "key" });

    const bindField4: FormBindingFuncExtension.ForField.RequiredConfig<
      SampleModel,
      typeof SampleConfigurableFieldBinding
    > = () => ({}) as any;
    // @ts-expect-error Expected 2 arguments, but got 1
    bindField4("string");
    // @ts-expect-error Property 'sample' is missing
    bindField4("string", {});
    bindField4("string", { sample: true });
    bindField4("string", { sample: true, cacheKey: "key" });

    const bindMultiField1: FormBindingFuncExtension.ForMultiField.OptionalConfig<
      SampleModel,
      typeof SampleMultiFieldBinding
    > = () => ({}) as any;
    bindMultiField1(["string"]);
    bindMultiField1(["string"], {});
    bindMultiField1(["string"], { cacheKey: "key" });

    const bindMultiField2: FormBindingFuncExtension.ForMultiField.RequiredConfig<
      SampleModel,
      typeof SampleMultiFieldBinding
    > = () => ({}) as any;
    // @ts-expect-error Expected 2 arguments, but got 1
    bindMultiField2(["string"]);
    bindMultiField2(["string"], {});
    bindMultiField2(["string"], { cacheKey: "key" });

    const bindMultiField3: FormBindingFuncExtension.ForMultiField.OptionalConfig<
      SampleModel,
      typeof SampleConfigurableMultiFieldBinding
    > = () => ({}) as any;
    bindMultiField3(["string"]);
    // @ts-expect-error Property 'sample' is missing
    bindMultiField3(["string"], {});
    bindMultiField3(["string"], { sample: true });
    bindMultiField3(["string"], { sample: true, cacheKey: "key" });

    const bindMultiField4: FormBindingFuncExtension.ForMultiField.RequiredConfig<
      SampleModel,
      typeof SampleConfigurableMultiFieldBinding
    > = () => ({}) as any;
    // @ts-expect-error Expected 2 arguments, but got 1
    bindMultiField4(["string"]);
    // @ts-expect-error Property 'sample' is missing
    bindMultiField4(["string"], {});
    bindMultiField4(["string"], { sample: true });
    bindMultiField4(["string"], { sample: true, cacheKey: "key" });
  });
});
