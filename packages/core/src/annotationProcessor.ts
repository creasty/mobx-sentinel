import { Decorator202112, Decorator202203, isDecorator202112, isDecorator202203 } from "./decorator";

export class AnnotationProcessor {
  readonly #propertyLike = new Map<
    symbol,
    Map<
      string | symbol,
      {
        data: any[];
        get?: () => any;
      }
    >
  >();

  /** Register a property like annotation */
  registerPropertyLike(
    annotationKey: symbol,
    args: {
      propertyKey: string | symbol;
      data: any;
      get?: () => any;
    }
  ) {
    let annotations = this.#propertyLike.get(annotationKey);
    if (!annotations) {
      annotations = new Map();
      this.#propertyLike.set(annotationKey, annotations);
    }

    let propertyMetadata = annotations.get(args.propertyKey);
    if (!propertyMetadata) {
      propertyMetadata = { data: [], get: args.get };
      annotations.set(args.propertyKey, propertyMetadata);
    }

    propertyMetadata.data.push(args.data);
  }

  /** Get all registered property like annotations */
  getPropertyLike(annotationKey: symbol) {
    return this.#propertyLike.get(annotationKey);
  }

  /** Clone the annotation processor */
  clone() {
    const clone = new AnnotationProcessor();
    for (const [annotationKey, properties] of this.#propertyLike) {
      for (const [propertyKey, propertyMetadata] of properties) {
        for (const data of propertyMetadata.data) {
          clone.registerPropertyLike(annotationKey, {
            propertyKey,
            data,
            get: propertyMetadata.get,
          });
        }
      }
    }
    return clone;
  }
}

const store = new WeakMap<object, AnnotationProcessor>();

function getStored(target: object): { processor: AnnotationProcessor | null; isOwn: boolean } {
  let isOwn = true;
  while (target && typeof target === "object") {
    const processor = store.get(target);
    if (processor) {
      return { processor, isOwn };
    }
    isOwn = false;
    target = Object.getPrototypeOf(target);
  }
  return { processor: null, isOwn };
}

function createStored(target: object, clone: boolean) {
  const s = getStored(target);
  if (!s.processor) {
    s.processor = new AnnotationProcessor();
    store.set(target, s.processor);
  } else if (clone && !s.isOwn) {
    s.processor = s.processor.clone();
    store.set(target, s.processor);
  }
  return s.processor;
}

/** Get the annotation processor for the target */
export function getAnnotationProcessor(target: object) {
  return getStored(target).processor;
}

/** Create a property like annotation */
export function createPropertyLikeAnnotation<T extends object, Data>(
  annotationKey: symbol,
  getData: (propertyKey: string | symbol) => Data
): Decorator202112.PropertyDecorator<T> &
  Decorator202203.ClassGetterDecorator<T> &
  Decorator202203.ClassAccessorDecorator<T> &
  Decorator202203.ClassFieldDecorator<T> {
  return (target, context) => {
    if (isDecorator202203(context)) {
      context.addInitializer(function () {
        const processor = createStored(this as T, false);
        processor.registerPropertyLike(annotationKey, {
          propertyKey: context.name,
          data: getData(context.name),
          get: () => context.access.get(this),
        });
      });
    } else if (target && isDecorator202112(context)) {
      const processor = createStored(target, true);
      processor.registerPropertyLike(annotationKey, {
        propertyKey: context,
        data: getData(context),
      });
    }
  };
}
