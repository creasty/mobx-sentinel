export namespace Decorator202112 {
  /* eslint-disable @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-wrapper-object-types */
  export type ClassDecorator<TFunction extends Function> = (target: TFunction) => TFunction | void;
  export type PropertyDecorator<TObject extends Object> = (target: TObject, propertyKey: string | symbol) => void;
  export type MethodDecorator<TObject extends Object, T> = (
    target: TObject,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>
  ) => TypedPropertyDescriptor<T> | void;
  export type ParameterDecorator<TObject extends Object> = (
    target: TObject,
    propertyKey: string | symbol | undefined,
    parameterIndex: number
  ) => void;
  /* eslint-enable @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-wrapper-object-types */
}

export namespace Decorator202203 {
  export type ClassDecorator<Value extends abstract new (...args: any) => any = abstract new (...args: any) => any> = (
    value: Value,
    context: ClassDecoratorContext<Value>
  ) => Value | void;
  export type ClassAccessorDecorator<This = any, Value = any> = (
    value: ClassAccessorDecoratorTarget<This, Value>,
    context: ClassAccessorDecoratorContext
  ) => ClassAccessorDecoratorResult<This, Value> | void;
  export type ClassGetterDecorator<This = any, Value = any> = (
    value: (this: This) => Value,
    context: ClassGetterDecoratorContext
  ) => ((this: This) => Value) | void;
  export type ClassSetterDecorator<This = any, Value = any> = (
    value: (this: This, value: Value) => void,
    context: ClassSetterDecoratorContext
  ) => ((this: This, value: Value) => void) | void;
  export type ClassMethodDecorator<This = any, Value extends (...p: any[]) => any = any> = (
    value: Value,
    context: ClassMethodDecoratorContext<This, Value>
  ) => Value | void;
  export type ClassFieldDecorator<This = any, Value extends (...p: any[]) => any = any> = (
    value: undefined,
    context: ClassFieldDecoratorContext<This, Value>
  ) => Value | void;
}

export function isDecorator202203(context: any): context is DecoratorContext {
  return typeof context == "object" && typeof context["kind"] == "string";
}

export function isDecorator202112(context: any): context is string | symbol {
  return typeof context == "string" || typeof context == "symbol";
}
