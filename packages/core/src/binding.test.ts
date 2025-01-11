import { v4 as uuidV4 } from "uuid";
import { FormBinding, FormBindingConstructor, FormBindingFunc } from "./binding";
import { Form } from "./Form";
import { FormField } from "./FormField";

export class SampleFormBinding implements FormBinding {
  readonly id = uuidV4();

  constructor(private form: Form<unknown>) {
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
    private form: Form<unknown>,
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
