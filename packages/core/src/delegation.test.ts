import { FormDelegate, getDelegation } from "./delegation";

describe("getDelegation", () => {
  it("gets direct delegation when subject implements FormDelegate", () => {
    const delegate = {
      [FormDelegate.config]: {},
      [FormDelegate.submit]: async () => true,
    };

    expect(getDelegation(delegate)).toBe(delegate);
  });

  it("gets indirect delegation when subject implements FormDelegated", () => {
    const delegate = {
      [FormDelegate.config]: {},
      [FormDelegate.submit]: async () => true,
    };

    const subject = {
      [FormDelegate.delegate]: delegate,
    };

    expect(getDelegation(subject)).toBe(delegate);
  });

  it("returns undefined for non-object values", () => {
    expect(getDelegation(null)).toBeUndefined();
    expect(getDelegation(undefined)).toBeUndefined();
    expect(getDelegation(123)).toBeUndefined();
    expect(getDelegation("string")).toBeUndefined();
  });

  it("returns undefined for objects without delegation", () => {
    expect(getDelegation({})).toBeUndefined();
    expect(getDelegation([])).toBeUndefined();
    expect(getDelegation({ foo: "bar" })).toBeUndefined();
  });
});
