import { Decorator202112, Decorator202203, isDecorator202112, isDecorator202203 } from "./decorator";

/**
 * One class member annotated with a property-like annotation
 *
 * @remarks
 * A member is not the same thing as a property key: same-named ECMAScript private members of a parent and a child
 * class are members of their own that spell one key, so several records can share a `propertyKey`.
 */
export type PropertyLikeMember = {
  /** Key the member is spelled with, such as `"items"` or `"#items"` */
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

const memberKeys = new WeakMap<object, Map<string | symbol, symbol>>();

/**
 * Mint the identity of one member of a scope
 *
 * @remarks
 * One symbol per pair, kept for as long as the scope lives, so every registration naming that member of that scope
 * lands on one entry while the same name under another scope lands on another. Nothing outside can mint or
 * reconstruct one, so a caller holding the map reads its values rather than looking a scoped member up.
 *
 * @param scope - Object whose identity stands for the declaring class
 * @param name - Key the member is spelled with, such as `"#items"`
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
   * - The processor identifies the member by `propertyKey`, and by `scope` when one is given; registrations that
   *   agree on both are one member, and their data accumulates in registration order
   * - A property overridden in a child class spells the same key with no scope, so it is the same member, and
   *   parent and child annotations are preserved under one entry
   * - `get` is taken from the first registration for a member; later ones only add data
   */
  registerPropertyLike(
    annotationKey: symbol,
    args: {
      /** Key the member is spelled with */
      propertyKey: string | symbol;
      /**
       * Object whose identity stands for the class declaring the member
       *
       * Pass one only for an ECMAScript private member, and one that is the same for every registration on that
       * class: a `#name` belongs to the class that declares it, so a parent's `#items` and a child's `#items` are
       * members of their own that must not merge, even though they spell one key. Leave it out otherwise, so that
       * a child's override merges with the property it overrides.
       */
      scope?: object;
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

    const memberKey = args.scope ? memberKeyFor(args.scope, args.propertyKey) : args.propertyKey;
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
   * @returns Map of every member to its annotations in registration order, or undefined if no annotations exist.\
   *   A member registered without a scope is keyed by its `propertyKey`, a scoped one by an identity of the
   *   processor's own, so read the values rather than looking a member up. Two entries share a `propertyKey` only
   *   for same-named private members.
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

/**
 * Create a property-like annotation
 *
 * @remarks
 * - Stage2 annotations are processed at declaration time, not instantiation time
 * - Stage3 annotations are processed at instantiation time
 * - Supports both public and private class members
 * - Works with properties, getters, and class fields
 * - Auto accessors are not supported in stage2 decorators
 * - Stage3 private members of a parent and a child class register as separate members of one property key, each
 *   under a scope of its own; stage2 decorators cannot see private members at all
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
      // The context describes the annotated member, so the scope is picked once here rather than per instance.
      // It has to be one object per declaring class, which the context offers in two ways:
      // - `context.metadata`, which esbuild (so Vite and tsup) and Babel always emit. It is typed as always
      //   present, but the compilers that emit no decorator metadata pass undefined.
      // - Failing that -- plain `tsc` on a runtime that has no `Symbol.metadata`, as Node does not --
      //   `context.access.has`, which tsc creates once per member of a class, and therefore shares between
      //   decorators stacked on one member.
      const scope = context.private ? (context.metadata ?? context.access.has) : undefined;
      context.addInitializer(function () {
        const processor = createStored(this as T, false);
        processor.registerPropertyLike(annotationKey, {
          propertyKey: context.name,
          scope,
          data: getData(context.name),
          // A setter has no `access.get`. Leaving the member without one lets the consumers fall back to reading the
          // property, which yields undefined for a set-only accessor rather than throwing.
          get: context.access.get ? () => context.access.get(this) : undefined,
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
