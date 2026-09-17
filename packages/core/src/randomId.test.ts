import { randomId } from "./randomId";

describe("randomId", () => {
  it("returns 32 lowercase hex digits", () => {
    expect(randomId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("returns a different id on each call", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => randomId()));
    expect(ids.size).toBe(1000);
  });

  it("encodes 16 bytes from crypto.getRandomValues, in order", () => {
    const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation((array: any) => {
      array.set(Array.from({ length: array.length }, (_, i) => i));
      return array;
    });
    onTestFinished(() => {
      spy.mockRestore();
    });

    expect(randomId()).toBe("000102030405060708090a0b0c0d0e0f");
    expect(spy).toHaveBeenCalledOnce();
  });
});
