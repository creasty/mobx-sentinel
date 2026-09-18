import {
  isBoxedObservable,
  isComputedProp,
  isObservableArray,
  isObservableSet,
  isObservableMap,
  isObservableObject,
  isObservableProp,
  getAtom,
  untracked,
  $mobx,
  type IComputedValue,
  type IObservableValue,
} from "mobx";

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
 * It goes through the public API of MobX, as its production builds mangle every internal name ending in `_`.\
 * The one exception is finding the keys that are not properties, such as ECMAScript private keys, which nothing public
 * lists: see {@link getCandidateKeys}.
 */
export function* getMobxObservableAnnotations(
  target: object
): Generator<[key: string | symbol | number, getValue: () => any]> {
  if (!isObservableObject(target)) return;

  // Snapshot, as consuming the getters (as Watcher does) or anything done in the meantime can add and remove keys.
  // Untracked, as listing the keys of a proxied observable object is observed by the derivation running it.
  const entries = untracked(() => {
    const result = new Map<string | symbol | number, ObservableAtom | undefined>();
    for (const key of getCandidateKeys(target)) {
      if (!isObservableProp(target, key)) continue;
      // MobX only removes keys that are own properties, and once it does, the atom is the only way left to read the
      // last value. Capturing the other atoms up front would materialize the annotations that stage3 decorators apply
      // lazily (MobX 6.16+), which the getter leaves until it needs one.
      result.set(key, Object.hasOwn(target, key) ? getObservableAtom(target, key) : undefined);
    }
    return result;
  });

  for (const [key, capturedAtom] of entries) {
    let atom = capturedAtom;
    const getValue = () => {
      if (key in target) return (target as any)[key];
      atom ??= isObservableProp(target, key) ? getObservableAtom(target, key) : undefined;
      return atom?.get();
    };
    yield [key, getValue];
  }
}

/**
 * Whether the key of the target is annotated with MobX's `@computed`
 *
 * Also true for its variants such as `@computed.struct`, and false for keys that are not annotated at all.\
 * It does not materialize the annotations that stage3 decorators apply lazily (MobX 6.16+).
 *
 * `isComputedProp()` goes through `getAtom()`, which rejects the falsy keys `""` and `0`, so it throws for those once
 * they are annotated. They are taken as not computed, whatever their annotation.
 */
export function isMobxComputedAnnotation(target: object, key: string | symbol | number): boolean {
  if (!key) return false;
  return isComputedProp(target, key);
}

type ObservableAtom = IObservableValue<unknown> | IComputedValue<unknown>;

/**
 * Get the atom holding the value of an annotated key, materializing it if MobX applies the annotation lazily
 *
 * `getAtom()` rejects the falsy keys `""` and `0` as if they were missing, so those yield `undefined`.
 */
function getObservableAtom(target: object, key: string | symbol | number): ObservableAtom | undefined {
  if (!key) return;
  return getAtom(target, key) as unknown as ObservableAtom;
}

/**
 * Get the keys that may be annotated on the observable object, in the order to yield them
 *
 * Every annotated key is included, along with ones that are not annotated, which `isObservableProp()` tells apart.
 *
 * - Keys of properties come first, as `for...in` visits them: own ones, then those of prototypes, where stage3
 *   decorators define their accessors.
 * - Then the keys only the administration knows: ECMAScript private keys, which stage3 decorators annotate, and keys
 *   deleted from a non-proxied target without MobX. Nothing public lists them, so they are taken from every `Map` held
 *   by the administration, whatever its (mangled) name. That is where MobX holds the keys of both materialized and
 *   lazily applied annotations, at both ends of the supported range (6.11 and 6.16). Should that change, only these
 *   keys are lost.
 */
function getCandidateKeys(target: object): Set<string | symbol | number> {
  const keys = new Set<string | symbol | number>();

  let object: object | null = target;
  while (object && object !== Object.prototype) {
    for (const key of Reflect.ownKeys(object)) {
      keys.add(key);
    }
    object = Object.getPrototypeOf(object);
  }

  for (const value of Object.values((target as any)[$mobx])) {
    if (!(value instanceof Map)) continue;
    for (const key of value.keys()) {
      if (typeof key !== "string" && typeof key !== "symbol" && typeof key !== "number") continue;
      keys.add(key);
    }
  }

  return keys;
}
