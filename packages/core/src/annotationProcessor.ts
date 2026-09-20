import { Decorator202112, Decorator202203, isDecorator202112, isDecorator202203 } from "./decorator";

/**
 * One class member annotated with a property-like annotation
 *
 * @remarks
 * A member is not the same thing as a property key: same-named ECMAScript private members of a parent and a child
 * class are members of their own that spell one key, so several records can share a `propertyKey`.
 */
export type PropertyLikeMember = {
  /** Key the member is spelled with, such as `"items"` or `"#items"`, taken from the first registration */
  propertyKey: string | symbol;
  /** Data of every annotation registered for this member, in registration order */
  data: any[];
  /**
   * Read the member's value
   *
   * Only stage3 decorators provide one; it reaches private members, which no key of the object names.
   */
  get?: () => any;
};

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
  readonly #propertyLike = new Map<symbol, Map<string | symbol, PropertyLikeMember>>();

  /**
   * Register a property-like annotation on one class member
   *
   * @remarks
   * - Multiple annotations can be registered for the same member; their data accumulates in registration order
   * - A property overridden in a child class is the same member, so both parent and child annotations are
   *   preserved under one entry
   * - `memberKey` is the identity of the annotated member and defaults to `propertyKey`, which is what makes an
   *   override merge. Only ECMAScript private members need a key of their own: a `#name` belongs to the class
   *   that declares it, so a child's `#name` is a member of its own rather than an override of the parent's.
   * - `propertyKey` and `get` are taken from the first registration for a member; later ones only add data
   */
  registerPropertyLikeMember(
    annotationKey: symbol,
    args: {
      /** Key the member is spelled with */
      propertyKey: string | symbol;
      /**
       * Identity of the annotated member, minted per declaring class; defaults to `propertyKey`
       *
       * Only an ECMAScript private member needs one: every other member is identified by the key it spells.
       */
      memberKey?: symbol;
      /** Annotation data to record */
      data: any;
      /** Reads the member's value; see {@link PropertyLikeMember.get} */
      get?: () => any;
    }
  ) {
    let members = this.#propertyLike.get(annotationKey);
    if (!members) {
      members = new Map();
      this.#propertyLike.set(annotationKey, members);
    }

    const memberKey = args.memberKey ?? args.propertyKey;
    let member = members.get(memberKey);
    if (!member) {
      member = { propertyKey: args.propertyKey, data: [], get: args.get };
      members.set(memberKey, member);
    }

    member.data.push(args.data);
  }

  /**
   * Get every member registered with the given annotation
   *
   * @returns Map of member keys to their annotations in registration order, or undefined if no annotations exist.\
   *   Two entries share a `propertyKey` only for same-named private members.
   */
  getPropertyLikeMembers(annotationKey: symbol) {
    return this.#propertyLike.get(annotationKey);
  }

  /**
   * Clone the annotation processor
   *
   * Used when inheriting annotations from parent classes
   */
  clone() {
    const clone = new AnnotationProcessor();
    for (const [annotationKey, members] of this.#propertyLike) {
      const copy = new Map<string | symbol, PropertyLikeMember>();
      for (const [memberKey, member] of members) {
        if (!member.data.length) continue; // Carries nothing; only mutating the live map can leave one behind
        // A copy of the data, since a later registration pushes onto it
        copy.set(memberKey, { propertyKey: member.propertyKey, data: [...member.data], get: member.get });
      }
      if (copy.size) clone.#propertyLike.set(annotationKey, copy);
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
        processor.registerPropertyLikeMember(annotationKey, {
          propertyKey: context.name,
          memberKey,
          data: getData(context.name),
          // A setter has no `access.get`. Leaving the member without one lets the consumers fall back to reading the
          // property, which yields undefined for a set-only accessor rather than throwing.
          get: context.access.get ? () => context.access.get(this) : undefined,
        });
      });
    } else if (target && isDecorator202112(context)) {
      const processor = createStored(target, true);
      processor.registerPropertyLikeMember(annotationKey, {
        propertyKey: context,
        data: getData(context),
      });
    }
  };
}
