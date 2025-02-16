export function buildKeyPath(...keys: (string | number | null)[]): string {
  return keys
    .flatMap((key) => {
      if (typeof key === "string") {
        return [key];
      }
      if (typeof key === "number") {
        return [String(key)];
      }
      return [];
    })
    .join(".");
}
