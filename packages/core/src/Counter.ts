import { action, computed, makeObservable, observable } from "mobx";

export class Counter {
  @observable count = 0;

  constructor() {
    makeObservable(this);
  }

  @action
  increment() {
    this.count += 1;
  }

  @computed
  get double() {
    return this.count * 2;
  }
}
