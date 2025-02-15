import { Validator } from "./validator";

export function makeValidatable<T extends object>(target: T, handler: Validator.ReactiveHandler) {
  const validator = Validator.get(target);
  validator.addAsyncHandler(async () => handler());
  //validator.addReactiveHandler(handler);
}
