type MaybeArray<T> = T | T[];
type ErrorValue = MaybeArray<string | Error>;

export type FormValidationResult<T> = {
  [K in keyof T]?: ErrorValue;
};

function getMessages(target: ErrorValue): string[] {
  if (typeof target === "string") {
    return [target];
  }
  if (target instanceof Error) {
    return [target.message];
  }
  return target.flatMap((v) => getMessages(v));
}

export function toErrorMap(result: FormValidationResult<any>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [key, value] of Object.entries(result)) {
    if (!value) continue;
    const messages = getMessages(value);
    if (messages.length > 0) {
      map.set(key, messages);
    }
  }
  return map;
}
