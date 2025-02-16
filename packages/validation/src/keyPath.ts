export type KeyPath = string & { __brand: "KeyPath" };

export function buildKeyPath(...keys: (string | number | null)[]): KeyPath {
  const keyPath = keys
    .flatMap((key) => {
      if (typeof key === "string") {
        return key ? [key] : []; // Ignore empty keys
      }
      if (typeof key === "number") {
        return [String(key)];
      }
      return [];
    })
    .join(".");
  return keyPath as KeyPath;
}
