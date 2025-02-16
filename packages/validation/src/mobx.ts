import {
  isBoxedObservable,
  isObservableArray,
  isObservableSet,
  isObservableMap,
  isObservableObject,
  $mobx,
} from "mobx";
import type { ObservableObjectAdministration } from "mobx/dist/internal";

/**
 * Shallow read the content of the value if applicable,
 * in order to be included in reactions
 *
 * Supports:
 * - boxed observables
 * - observable arrays
 * - observable sets
 * - observable maps
 */
export function shallowReadValue(value: any) {
  if (isBoxedObservable(value)) {
    value = value.get();
  }

  if (isObservableArray(value)) {
    return value.slice();
  }
  if (isObservableSet(value)) {
    return new Set(value);
  }
  if (isObservableMap(value)) {
    return new Map(value);
  }

  return value;
}

/**
 * Unwrap shallow contents of the value if applicable
 *
 * Supports:
 * - boxed observables
 * - arrays and observable arrays
 * - sets and observable sets
 * - maps and observable maps
 */
export function* unwrapShallowContents(value: any): Generator<[key: string | symbol | number | null, content: any]> {
  if (isBoxedObservable(value)) {
    value = value.get();
  }

  if (Array.isArray(value) || isObservableArray(value)) {
    let i = 0;
    for (const element of value) {
      yield [i++, element];
    }
    return;
  }
  if (value instanceof Set || isObservableSet(value)) {
    let i = 0;
    for (const element of value) {
      yield [i++, element];
    }
    return;
  }
  if (value instanceof Map || isObservableMap(value)) {
    for (const [key, element] of value) {
      yield [key, element];
    }
    return;
  }
  yield [null, value];
}

/**
 * Get all MobX's `@observable` and `@computed` annotations from the target object
 *
 * Also includes their variants such as `@observable.ref` and `@computed.struct`.
 *
 * It relies on the internal API, so it may break in future versions of MobX.\
 * When making changes, please ensure that the internal API is still available by runtime assertions.
 */
export function* getMobxObservableAnnotations(
  target: object
): Generator<[key: string | symbol | number, getValue: () => any]> {
  if (!isObservableObject(target)) return;
  const adm = (target as any)[$mobx] as ObservableObjectAdministration;

  if (typeof adm !== "object" || !adm) return;
  if (!("values_" in adm)) return;
  const values = adm.values_;
  if (!(values instanceof Map)) return;

  for (const [key, value] of values) {
    if (typeof key !== "string" && typeof key !== "symbol" && typeof key !== "number") continue;
    if (typeof value !== "object" || !value) continue;
    if (!("get" in value && typeof value.get === "function")) continue;
    const getValue = () => (key in target ? (target as any)[key] : value.get());
    yield [key, getValue];
  }
}
