import { MaybeArray } from "./util";

type ErrorValue = MaybeArray<string | Error>;
export type FormValidatorResult<T> = {
  [K in keyof T]?: ErrorValue | null;
};

type MutableErrorMap = Map<string, string[]>;
export type ErrorMap = ReadonlyMap<string, ReadonlyArray<string>>;

export function toErrorMap(results: FormValidatorResult<any>[]): MutableErrorMap {
  const map: MutableErrorMap = new Map();
  for (const result of results) {
    for (const [key, value] of Object.entries(result)) {
      if (!value) continue;
      const messages = getMessages(value);
      if (messages.length > 0) {
        let list = map.get(key);
        if (!list) {
          list = [];
          map.set(key, list);
        }
        list.push(...messages);
      }
    }
  }
  return map;
}

function getMessages(target: ErrorValue): string[] {
  if (typeof target === "string") {
    return [target];
  }
  if (target instanceof Error) {
    return [target.message];
  }
  return target.flatMap((v) => getMessages(v));
}
