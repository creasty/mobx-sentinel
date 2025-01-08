type MaybeArray<T> = T | T[];
type ErrorValue = MaybeArray<string | Error>;

export type FormValidationResult<T> = {
  [K in keyof T]?: ErrorValue | null;
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

export type ErrorMap = Map<string, string[]>;

export function toErrorMap(result: FormValidationResult<any>): ErrorMap {
  const map: ErrorMap = new Map();
  for (const [key, value] of Object.entries(result)) {
    if (!value) continue;
    const messages = getMessages(value);
    if (messages.length > 0) {
      map.set(key, messages);
    }
  }
  return map;
}
