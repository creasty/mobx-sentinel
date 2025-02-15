import { FormValidatorResult } from "./error";
import { Validator } from "./validator";

export function makeValidatable<T extends object>(target: T, build: () => FormValidatorResult<T>) {
  const validator = Validator.get(target);
  validator.addHandler(async () => build());
}
