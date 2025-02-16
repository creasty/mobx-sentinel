import { createPropertyLikeAnnotation, getAnnotationProcessor } from "./annotationProcessor";

const nestedKey = Symbol("nested");

/**
 * Annotation for nested objects
 */
export const nested = createPropertyLikeAnnotation(nestedKey, () => true);

/**
 * Get all `@nested` annotations from the target object
 */
export function* getNestedAnnotations(target: object): Generator<[key: string, getValue: () => any]> {
  const processor = getAnnotationProcessor(target);
  if (!processor) return;

  const annotations = processor.getPropertyLike(nestedKey);
  if (!annotations) return;

  for (const [key, metadata] of annotations) {
    if (typeof key !== "string") continue; // symbol and number keys are not supported
    const getValue = () => (key in target ? (target as any)[key] : metadata.get?.());
    yield [key, getValue];
  }
}
