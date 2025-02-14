import { makeValidatable } from "./builder";
import { getValidator } from "./validator";

describe("makeValidatable", () => {
  it("throws an error when a non-object is given", () => {
    expect(() => {
      makeValidatable(null as any, () => ({}));
    }).toThrowError(/Expected an object/);
    expect(() => {
      makeValidatable(1 as any, () => ({}));
    }).toThrowError(/Expected an object/);
  });

  it("adds a handler to the validator", () => {
    const target = {};
    const validator = getValidator(target);
    vi.spyOn(validator, "addHandler");
    const fn = () => ({});
    makeValidatable(target, fn);
    expect(validator.addHandler).toBeCalledWith(fn);
  });
});
