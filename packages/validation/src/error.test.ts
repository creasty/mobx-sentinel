import { toErrorMap } from "./error";

describe("toErrorMap", () => {
  describe("single result", () => {
    it("ignores null and undefined values", () => {
      expect(toErrorMap([{ field1: null, field2: undefined }])).toEqual(new Map());
    });

    it("ignores empty strings", () => {
      expect(toErrorMap([{ field1: "" }])).toEqual(new Map());
    });

    it("ignores empty arrays", () => {
      expect(toErrorMap([{ field1: [] }])).toEqual(new Map());
    });

    it("works with a string", () => {
      expect(toErrorMap([{ field1: "error" }])).toEqual(new Map([["field1", ["error"]]]));
    });

    it("works with an error", () => {
      expect(toErrorMap([{ field1: new Error("error") }])).toEqual(new Map([["field1", ["error"]]]));
    });

    it("works with an array of strings", () => {
      expect(toErrorMap([{ field1: ["error1", "error2"] }])).toEqual(new Map([["field1", ["error1", "error2"]]]));
    });

    it("works with an array of errors", () => {
      expect(toErrorMap([{ field1: [new Error("error1"), new Error("error2")] }])).toEqual(
        new Map([["field1", ["error1", "error2"]]])
      );
    });

    it("works with an array of strings and errors", () => {
      expect(toErrorMap([{ field1: ["error1", new Error("error2")] }])).toEqual(
        new Map([["field1", ["error1", "error2"]]])
      );
    });
  });

  describe("multiple results", () => {
    it("does not invalidate the result with null or undefined values", () => {
      expect(toErrorMap([{ field1: "error" }, { field1: null }, { field1: undefined }])).toEqual(
        new Map([["field1", ["error"]]])
      );
    });

    it("merges a string and an error", () => {
      expect(toErrorMap([{ field1: "error" }, { field1: new Error("error2") }])).toEqual(
        new Map([["field1", ["error", "error2"]]])
      );
    });

    it("merges non-arrays and arrays", () => {
      expect(toErrorMap([{ field1: "error" }, { field1: ["error2", "error3"] }])).toEqual(
        new Map([["field1", ["error", "error2", "error3"]]])
      );
    });

    it("merges an array of strings and an array of errors", () => {
      expect(
        toErrorMap([{ field1: ["error1", "error2"] }, { field1: [new Error("error3"), new Error("error4")] }])
      ).toEqual(new Map([["field1", ["error1", "error2", "error3", "error4"]]]));
    });

    it("merges multiple fields", () => {
      expect(toErrorMap([{ field1: "error1" }, { field1: "error3", field2: "error4" }])).toEqual(
        new Map([
          ["field1", ["error1", "error3"]],
          ["field2", ["error4"]],
        ])
      );
    });
  });
});
