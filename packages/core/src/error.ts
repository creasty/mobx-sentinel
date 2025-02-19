import { buildKeyPath, getParentKeyOfKeyPath, KeyPath, KeyPathMultiMap } from "./keyPath";

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

const buildToken = Symbol("validationErrorMapBuilder.build");

export class ValidationErrorMapBuilder<T> {
  readonly #map = new KeyPathMultiMap<ValidationError>();

  /** @internal @ignore */
  static build(instance: ValidationErrorMapBuilder<any>) {
    return instance[buildToken]();
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

  /** Whether the builder has any errors */
  get hasError() {
    return this.#map.size > 0;
  }

  /** @internal @ignore */
  [buildToken]() {
    return this.#map.toImmutable();
  }
}
