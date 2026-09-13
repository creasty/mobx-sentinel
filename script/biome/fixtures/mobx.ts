// Fixtures for the GritQL plugins in script/biome, checked by `pnpm lint:plugins`.
//
// The clean classes must produce no diagnostic. Each violation carries a suppression
// comment rather than an expected-error marker: a plugin that stops matching after a
// Biome upgrade leaves its suppression unused, which only warns -- so `lint:plugins`
// runs with `--error-on-warnings` to turn that into a failure.
import { action, computed, makeAutoObservable, makeObservable, observable } from "mobx";

export class Clean {
  @observable value = 0;

  @computed
  get double() {
    return this.value * 2;
  }

  @action.bound
  increment() {
    this.value++;
  }

  constructor() {
    makeObservable(this);
  }
}

export class CleanWithNullishAnnotations {
  @observable value = 0;

  constructor() {
    makeObservable(this, undefined);
  }
}

// biome-ignore lint/plugin/mobxMissingMakeObservable: fixture
export class NoConstructor {
  @observable value = 0;
}

// biome-ignore lint/plugin/mobxMissingMakeObservable: fixture
export class NoCall {
  @observable value = 0;

  constructor() {
    this.value = 1;
  }
}

export class AnnotationsWithDecorators {
  @observable value = 0;

  constructor() {
    // biome-ignore lint/plugin/mobxMissingMakeObservable: fixture
    makeObservable(this, { value: observable });
  }
}

export class Conditional {
  @observable value = 0;

  constructor(auto: boolean) {
    makeObservable(this);
    if (auto) {
      // biome-ignore lint/plugin/mobxUnconditionalMakeObservable: fixture
      makeAutoObservable(this);
    }
  }
}
