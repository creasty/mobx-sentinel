export class ValidationError extends Error {
  readonly key: string;
  readonly keyPath: string;
  readonly message: string;
  readonly cause?: Error;

  constructor(args: { keyPath: string; reason: string | Error }) {
    super();
    this.key = args.keyPath.split(".", 1)[0];
    this.keyPath = args.keyPath;
    this.message = args.reason instanceof Error ? args.reason.message : args.reason;
    this.cause = args.reason instanceof Error ? args.reason : undefined;
  }
}

const buildToken = Symbol("ValidationErrorsBuilder.build");

export class ValidationErrorsBuilder<T> {
  readonly #errors: ValidationError[] = [];

  /**
   * @internal
   * @ignore
   */
  static build(instance: ValidationErrorsBuilder<any>) {
    return instance[buildToken]();
  }

  invalidate(key: keyof T & string, reason: string | Error) {
    this.#errors.push(new ValidationError({ keyPath: key, reason }));
  }

  get hasError() {
    return this.#errors.length > 0;
  }

  /**
   * @internal
   * @ignore
   */
  [buildToken](): ReadonlyArray<ValidationError> {
    return Object.freeze(this.#errors);
  }
}
