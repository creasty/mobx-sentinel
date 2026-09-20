// Fixtures for the tests under test-stage3/, which mix the two decorator flavours the library supports.
//
// A decorator runs with the flavour of the tsconfig covering the file it is written in, so a stage-2 annotated class
// cannot be declared under test-stage3/, whose tsconfig turns `experimentalDecorators` off. It belongs here instead:
// src/ is what the package's tsconfig compiles, with stage-2 decorators. Nothing of the library's own code imports
// this file, and the package entry point does not export it.
import { makeObservable, observable } from "mobx";
import { nested } from "./nested";

/** A nested object for {@link Stage2Base} to hold */
export class Stage2Leaf {
  @observable value = 0;

  constructor() {
    makeObservable(this);
  }
}

/**
 * A class annotated with stage-2 decorators, for the stage-3 tests to extend
 *
 * @remarks
 * Its annotations are registered on its prototype when this module is evaluated, so a stage-3 subclass of it finds
 * a processor up the prototype chain, which its initializers clone onto the instance rather than register into.
 */
export class Stage2Base {
  @nested @observable child = new Stage2Leaf();

  constructor() {
    makeObservable(this);
  }
}
