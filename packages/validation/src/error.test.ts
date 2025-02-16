import { ValidationError, ValidationErrorsBuilder } from "./error";
import { buildKeyPath } from "./keyPath";

describe("ValidationError", () => {
  it("can be created with a string reason", () => {
    const error = new ValidationError({ keyPath: buildKeyPath("key1.subKey1"), reason: "reason" });
    expect(error.key).toBe("key1");
    expect(error.keyPath).toBe("key1.subKey1");
    expect(error.message).toBe("reason");
    expect(error.cause).toBeUndefined();
  });

  it("can be created with an error reason", () => {
    const error = new ValidationError({ keyPath: buildKeyPath("key1.subKey1"), reason: new Error("reason") });
    expect(error.key).toBe("key1");
    expect(error.keyPath).toBe("key1.subKey1");
    expect(error.message).toBe("reason");
    expect(error.cause).toBeInstanceOf(Error);
  });
});

describe("ValidationErrorsBuilder", () => {
  it("can be created", () => {
    const builder = new ValidationErrorsBuilder<unknown>();
    expect(builder.hasError).toBe(false);
  });

  describe(".build", () => {
    it("returns a frozen array", () => {
      const builder = new ValidationErrorsBuilder<unknown>();
      const errors = ValidationErrorsBuilder.build(builder);
      expect(errors).toBeInstanceOf(Array);
      expect(Object.isFrozen(errors)).toBe(true);
    });
  });

  describe("#invalidate", () => {
    it("adds an error for the given key", () => {
      const builder = new ValidationErrorsBuilder<{ key1: number; key2: number }>();
      builder.invalidate("key1", "reason");
      expect(builder.hasError).toBe(true);

      const errors = ValidationErrorsBuilder.build(builder);
      expect(errors).toEqual([new ValidationError({ keyPath: buildKeyPath("key1"), reason: "reason" })]);
    });

    it("adds another error for the same key", () => {
      const builder = new ValidationErrorsBuilder<{ key1: number; key2: number }>();
      builder.invalidate("key1", "reason1");
      builder.invalidate("key1", "reason2");
      expect(builder.hasError).toBe(true);

      const errors = ValidationErrorsBuilder.build(builder);
      expect(errors).toEqual([
        new ValidationError({ keyPath: buildKeyPath("key1"), reason: "reason1" }),
        new ValidationError({ keyPath: buildKeyPath("key1"), reason: "reason2" }),
      ]);
    });

    it("adds an error for a different key", () => {
      const builder = new ValidationErrorsBuilder<{ key1: number; key2: number }>();
      builder.invalidate("key1", "reasonA");
      builder.invalidate("key2", "reasonB");
      expect(builder.hasError).toBe(true);

      const errors = ValidationErrorsBuilder.build(builder);
      expect(errors).toEqual([
        new ValidationError({ keyPath: buildKeyPath("key1"), reason: "reasonA" }),
        new ValidationError({ keyPath: buildKeyPath("key2"), reason: "reasonB" }),
      ]);
    });
  });
});
