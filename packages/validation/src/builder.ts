import { FormValidatorResult } from "./error";
import { getValidator } from "./validator";

export function makeValidatable<T extends object>(target: T, build: () => FormValidatorResult<T>) {
  const validator = getValidator(target);
  validator.addHandler(async () => build());
}
