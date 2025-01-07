import { v4 as uuidV4 } from "uuid";
import { FormBinding, FormBindingConstructor, FormBindingFunc } from "./binding";
import { Form } from "./Form";
import { FormField } from "./FormField";

export class SampleFieldBinding implements FormBinding {
  readonly id = uuidV4();
  readonly field: FormField;

  constructor(field: FormField) {
    this.field = field;
  }

  get props() {
    return {
      bindingId: this.id,
      fieldName: this.field.fieldName,
    };
  }
}

export class SampleConfigurableFieldBinding implements FormBinding {
  readonly id = uuidV4();
  readonly field: FormField;
  config: { sample: boolean };

  constructor(field: FormField, config: SampleConfigurableFieldBinding["config"]) {
    this.field = field;
    this.config = config;
  }

  get props() {
    return {
      bindingId: this.id,
      config: this.config,
      fieldName: this.field.fieldName,
    };
  }
}

export class SampleFormBinding implements FormBinding {
  readonly id = uuidV4();
  readonly form: Form<unknown>;

  constructor(form: Form<unknown>) {
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
  readonly form: Form<unknown>;
  config: { sample: boolean };

  constructor(form: Form<unknown>, config: SampleConfigurableFormBinding["config"]) {
    this.form = form;
    this.config = config;
  }

  get props() {
    return {
      bindingId: this.id,
      formId: this.form.id,
      config: this.config,
    };
  }
}

class SampleModel {
  string = "sample";
}

describe("FormBindingConstructor", () => {
  type TheForm = Form<SampleModel>;
  test("provides correct type definitions for form and field bindings", () => {
    // For form
    SampleFormBinding satisfies FormBindingConstructor.ForForm<TheForm>;
    SampleConfigurableFormBinding satisfies FormBindingConstructor.ForForm<TheForm>;

    // For field
    SampleFieldBinding satisfies FormBindingConstructor.ForField;
    SampleConfigurableFieldBinding satisfies FormBindingConstructor.ForField;

    // Union
    // @ts-expect-error FIXME
    SampleFormBinding satisfies FormBindingConstructor<TheForm>;
    // @ts-expect-error FIXME
    SampleConfigurableFormBinding satisfies FormBindingConstructor<TheForm>;
    // @ts-expect-error FIXME
    SampleFieldBinding satisfies FormBindingConstructor<TheForm>;
    // @ts-expect-error FIXME
    SampleConfigurableFieldBinding satisfies FormBindingConstructor<TheForm>;
  });
});

describe("FormBindingFunc", () => {
  type TheForm = Form<SampleModel>;
  test("provides correct type definitions for form and field bindings", () => {
    // For form
    const bindForm: FormBindingFunc.ForForm<TheForm> = () => ({}) as any;
    bindForm(SampleFormBinding);
    // @ts-expect-error FIXME
    bindForm(SampleConfigurableFormBinding, { sample: true });
    // For field
    const bindField: FormBindingFunc.ForField<TheForm> = () => ({}) as any;
    bindField("sample", SampleFieldBinding);
    bindField("sample", SampleConfigurableFieldBinding, { sample: true });

    // Union
    const bind: FormBindingFunc<TheForm, SampleFormBinding> = () => ({}) as any;
    bind(SampleFormBinding);
    // @ts-expect-error FIXME
    bind(SampleConfigurableFormBinding, { sample: true });
    bind("sample", SampleFieldBinding);
    bind("sample", SampleConfigurableFieldBinding, { sample: true });
  });
});
