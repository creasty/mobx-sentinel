// Fixtures for the tests of bindings, shared by binding.test.ts and form.test.ts.
//
// They live outside the test files because a test file that imports another one registers that file's tests too,
// which then run twice. Nothing of the library's own code imports this file, and the package entry point does not
// export it.
import { randomId } from "./randomId";
import { FormBinding } from "./binding";
import { Form } from "./form";
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
