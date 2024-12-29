import { Counter } from "./Counter";
import { autorun } from "mobx";

test("Counter reactivity", () => {
  const counter = new Counter();
  let observedDouble = 0;

  // Use autorun to observe changes to the computed property
  autorun(() => {
    observedDouble = counter.double;
  });

  expect(observedDouble).toBe(0);

  counter.increment();
  expect(observedDouble).toBe(2);

  counter.increment();
  expect(observedDouble).toBe(4);
});
