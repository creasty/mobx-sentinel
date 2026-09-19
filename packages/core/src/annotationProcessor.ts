import { Decorator202112, Decorator202203, isDecorator202112, isDecorator202203 } from "./decorator";

/**
 * Processor for handling property-like annotations
 *
 * Key features:
 * - Supports both stage2 and stage3 decorators
 * - Handles inheritance correctly - annotations from parent classes are preserved
 * - Supports property overrides in child classes
 * - Supports private fields and methods, which a child class declares anew rather than overrides
 */
export class AnnotationProcessor {
  readonly #propertyLike = new Map<
    symbol,
    Map<
      string | symbol,
      {
        data: any[];
        get?: () => any;
        members: Map<string | symbol, { data: any[]; get?: () => any }>;
      }
    >
  >();

  /**
   * Register a property-like annotation
   *
   * @remarks
   * - Multiple annotations can be registered for the same property
   * - When a property is overridden in a child class, both parent and child annotations are preserved
   * - `memberKey` tells apart class members that share a property key. Only ECMAScript private members can:
   *   a `#name` belongs to the class that declares it, so a child's `#name` is a member of its own rather than
   *   an override of the parent's.
   */
  registerPropertyLike(
    annotationKey: symbol,
    args: {
      propertyKey: string | symbol;
      /** Identity of the annotated member; defaults to `propertyKey` */
      memberKey?: string | symbol;
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
      propertyMetadata = { data: [], get: args.get, members: new Map() };
      annotations.set(args.propertyKey, propertyMetadata);
    }

    const memberKey = args.memberKey ?? args.propertyKey;
    let member = propertyMetadata.members.get(memberKey);
    if (!member) {
      member = { data: [], get: args.get };
      propertyMetadata.members.set(memberKey, member);
    }

    member.data.push(args.data);
    propertyMetadata.data.push(args.data);
  }

  /**
   * Get all registered property-like annotations
   *
   * @returns Map of property keys to their metadata, or undefined if no annotations exist.\
   *   `members` holds the registrations, one record per annotated member -- more than one only for same-named
   *   private members. `data` and `get` are a merged view over them: the data of every registration in order,
   *   and the `get` of the first one.
   */
  getPropertyLike(annotationKey: symbol) {
    return this.#propertyLike.get(annotationKey);
  }

  /**
   * Clone the annotation processor
   *
   * Used when inheriting annotations from parent classes
   */
  clone() {
    const clone = new AnnotationProcessor();
    for (const [annotationKey, properties] of this.#propertyLike) {
      for (const [propertyKey, propertyMetadata] of properties) {
        for (const [memberKey, member] of propertyMetadata.members) {
          for (const data of member.data) {
            clone.registerPropertyLike(annotationKey, {
              propertyKey,
              memberKey,
              data,
              get: member.get,
            });
          }
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

/**
 * Get the annotation processor for the target object
 *
 * @returns The annotation processor or null if not found
 */
export function getAnnotationProcessor(target: object) {
  return getStored(target).processor;
}

const memberKeys = new WeakMap<object, Map<string | symbol, symbol>>();

/**
 * Mint a key that identifies one ECMAScript private member
 *
 * @remarks
 * A `#name` belongs to the class that declares it, so a parent's `#items` and a child's `#items` are distinct
 * members that cannot override each other, even though they register under the same property key. The `scope`
 * that tells them apart is what the stage3 decorator context offers per class:
 * - `context.metadata`, one object per class, which esbuild (so Vite and tsup) and Babel always emit.
 * - Failing that -- plain `tsc` on a runtime that has no `Symbol.metadata`, as Node does not -- `context.access.has`,
 *   which tsc creates once per member of a class, and therefore shares between decorators stacked on one member.
 *
 * @param scope - Object whose identity stands for the declaring class
 * @param name - Spelling of the private member, such as `"#items"`
 */
function memberKeyFor(scope: object, name: string | symbol) {
  let keys = memberKeys.get(scope);
  if (!keys) {
    keys = new Map();
    memberKeys.set(scope, keys);
  }
  let key = keys.get(name);
  if (!key) {
    key = Symbol(String(name));
    keys.set(name, key);
  }
  return key;
}

/**
 * Create a property-like annotation
 *
 * @remarks
 * - Stage2 annotations are processed at declaration time, not instantiation time
 * - Stage3 annotations are processed at instantiation time
 * - Supports both public and private class members
 * - Works with properties, getters, and class fields
 * - Auto accessors are not supported in stage2 decorators
 * - Stage3 private members of a parent and a child class register as separate members of one property key,
 *   as {@link memberKeyFor} describes; stage2 decorators cannot see private members at all
 *
 * @param annotationKey - Unique symbol to identify this annotation type
 * @param getData - Function to generate annotation data for a property
 */
export function createPropertyLikeAnnotation<T extends object, Data>(
  annotationKey: symbol,
  getData: (propertyKey: string | symbol) => Data
): Decorator202112.PropertyDecorator<T> &
  Decorator202203.ClassGetterDecorator<T> &
  Decorator202203.ClassAccessorDecorator<T> &
  Decorator202203.ClassFieldDecorator<T> {
  return (target, context) => {
    if (isDecorator202203(context)) {
      // The context describes the annotated member, so the key is minted once here rather than per instance.
      // `metadata` is typed as always present, but the compilers that emit no decorator metadata pass undefined.
      const memberKey = context.private
        ? memberKeyFor(context.metadata ?? context.access.has, context.name)
        : undefined;
      context.addInitializer(function () {
        const processor = createStored(this as T, false);
        processor.registerPropertyLike(annotationKey, {
          propertyKey: context.name,
          memberKey,
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
