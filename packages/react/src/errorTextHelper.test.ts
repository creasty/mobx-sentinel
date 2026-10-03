import { makeObservable, observable } from "mobx";
import { Form } from "@mobx-sentinel/form";
import { errorTextId } from "./errorTextHelper";

class SampleModel {
  @observable city = "";

  constructor() {
    makeObservable(this);
  }
}

describe("errorTextId", () => {
  it("is the field's stable id followed by :error", () => {
    const form = Form.get(new SampleModel());
    const field = form.getField("city");
    expect(errorTextId(field)).toBe(`${field.id}:error`);

    form.stableId = "_R_0_";
    expect(errorTextId(field)).toBe("_R_0_:city:error");
  });
});
