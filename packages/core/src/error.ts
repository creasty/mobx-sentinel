import { buildKeyPath, getParentKeyOfKeyPath, KeyPath, KeyPathMultiMap, KeyPathSelf } from "./keyPath";

export class ValidationError extends Error {
  readonly key: KeyPath;
  readonly keyPath: KeyPath;
  readonly message: string;
  readonly cause?: Error;

  constructor(args: { keyPath: KeyPath; reason: string | Error }) {
    super();
    this.key = getParentKeyOfKeyPath(args.keyPath);
    this.keyPath = args.keyPath;
    this.message = args.reason instanceof Error ? args.reason.message : args.reason;
    this.cause = args.reason instanceof Error ? args.reason : undefined;
  }
}

export class ValidationErrorMapBuilder<T> {
  readonly #map = new KeyPathMultiMap<ValidationError>();

  /** @internal @ignore */
  static build(instance: ValidationErrorMapBuilder<any>) {
    return instance.#build();
  }

  /**
   * Invalidate the key
   *
   * Multiple reasons can be added for the same key.
   */
  invalidate(key: keyof T & string, reason: string | Error) {
    const keyPath = buildKeyPath(key);
    const error = new ValidationError({ keyPath, reason });
    this.#map.set(keyPath, error);
  }

  /**
   * Invalidate the target object itself
   *
   * This is useful with `@nested.hoist` to invalidate the parent object.
   */
  invalidateSelf(reason: string | Error) {
    const keyPath = KeyPathSelf;
    const error = new ValidationError({ keyPath, reason });
    this.#map.set(keyPath, error);
  }

  /** Whether the builder has any errors */
  get hasError() {
    return this.#map.size > 0;
  }

  #build() {
    return this.#map.toImmutable();
  }
}
