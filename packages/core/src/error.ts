import { KeyPath, KeyPathMultiMap } from "./keyPath";

/**
 * Represents a validation error for a specific key path
 */
export class ValidationError extends Error {
  readonly key: KeyPath;
  readonly keyPath: KeyPath;
  readonly message: string;
  readonly cause?: Error;

  /**
   * Create a validation error
   *
   * @param args.keyPath Path to the invalid field
   * @param args.reason Error message or Error object
   */
  constructor(args: { keyPath: KeyPath; reason: string | Error }) {
    super();
    this.key = KeyPath.getParentKey(args.keyPath);
    this.keyPath = args.keyPath;
    this.message = args.reason instanceof Error ? args.reason.message : args.reason;
    this.cause = args.reason instanceof Error ? args.reason : undefined;
  }
}

/**
 * Builder for collecting validation errors
 *
 * Key features:
 * - Collects errors for multiple keys
 * - Can invalidate the target object itself
 */
export interface ValidationErrorMapBuilder<T> {
  /**
   * Add an error for a key
   *
   * @remarks
   * Multiple reasons can be added for the same key.
   *
   * @param key Key to invalidate
   * @param reason Error message or Error object
   */
  invalidate(key: keyof T & string, reason: string | Error): void;

  /**
   * Invalidate the target object itself
   *
   * @remarks
   * This is useful with `@nested.hoist` to invalidate the parent object.
   */
  invalidateSelf(reason: string | Error): void;

  /** Whether the builder has any errors */
  readonly hasError: boolean;
}

/**
 * The validator's implementation of {@link ValidationErrorMapBuilder}
 *
 * @remarks
 * The package exports only the interface, so handlers can use a builder but cannot create one or build its error map.
 * Exporting this class with `type` instead would not work: tsup's declaration bundle emits a class as a value export
 * even then, and the JavaScript has no such export.
 */
export class ValidationErrorMapBuilderImpl<T> implements ValidationErrorMapBuilder<T> {
  readonly #map = new KeyPathMultiMap<ValidationError>();

  invalidate(key: keyof T & string, reason: string | Error) {
    const keyPath = KeyPath.build(key);
    const error = new ValidationError({ keyPath, reason });
    this.#map.set(keyPath, error);
  }

  invalidateSelf(reason: string | Error) {
    const keyPath = KeyPath.Self;
    const error = new ValidationError({ keyPath, reason });
    this.#map.set(keyPath, error);
  }

  get hasError() {
    return this.#map.size > 0;
  }

  /** Build an immutable error map */
  static build(instance: ValidationErrorMapBuilderImpl<any>) {
    return instance.#build();
  }
  #build() {
    return this.#map.toImmutable();
  }
}
