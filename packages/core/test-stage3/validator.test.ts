// biome-ignore-all lint/plugin/mobxMissingMakeObservable: stage-3 decorators need no makeObservable(this)
import { observable, runInAction } from "mobx";
import { makeValidatable, Validator } from "../src/validator";
import { nested } from "../src/nested";
import { KeyPath } from "../src/keyPath";

describe("Validator with stage-3 decorators", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  class Item {
    @observable accessor name = "";

    constructor() {
      makeValidatable(this, (b) => {
        if (!this.name) b.invalidate("name", "required");
      });
    }
  }

  class Order {
    @observable accessor title = "";
    @nested accessor item = new Item();
    @nested @observable accessor items = [new Item()];

    constructor() {
      makeValidatable(this, (b) => {
        if (!this.title) b.invalidate("title", "required");
      });
      makeValidatable(
        this,
        () => this.title,
        async (title, b) => {
          if (title === "taken") b.invalidate("title", "taken");
        }
      );
    }
  }

  test("sync handlers run on registration and react to @observable accessor fields", () => {
    const item = new Item();
    const validator = Validator.get(item);
    expect(validator.invalidKeys).toEqual(new Set(["name"]));

    runInAction(() => {
      item.name = "filled";
    });
    expect(validator.reactionState).toBe(1);
    vi.advanceTimersByTime(100);
    expect(validator.reactionState).toBe(0);
    expect(validator.isValid).toBe(true);
  });

  test("async handlers receive the value of an accessor expression", async () => {
    const order = new Order();
    const validator = Validator.get(order);
    await vi.advanceTimersByTimeAsync(0);
    expect(validator.getErrorMessages("title" as KeyPath)).toEqual(new Set(["required"]));

    runInAction(() => {
      order.title = "taken";
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(validator.isValidating).toBe(false);
    expect(validator.getErrorMessages("title" as KeyPath)).toEqual(new Set(["taken"]));
  });

  test("errors of @nested accessor fields are aggregated into the parent", async () => {
    const order = new Order();
    const validator = Validator.get(order);
    await vi.advanceTimersByTimeAsync(0);

    expect(validator.invalidKeys).toEqual(new Set(["title"]));
    expect(validator.invalidKeyPaths).toEqual(new Set(["title", "item.name", "items.0.name"]));
    expect(validator.getErrorMessages("items.0.name" as KeyPath)).toEqual(new Set(["required"]));
    expect(validator.nested.get("item" as KeyPath)).toBe(Validator.get(order.item));

    runInAction(() => {
      order.items.push(new Item());
    });
    expect(validator.invalidKeyPaths).toEqual(new Set(["title", "item.name", "items.0.name", "items.1.name"]));

    runInAction(() => {
      order.items = [];
    });
    expect(validator.invalidKeyPathCount).toBe(2);
  });

  test("errors of a @nested.hoist accessor are reported without the intermediate key", () => {
    class ItemList {
      @nested.hoist accessor list = [new Item(), new Item()];
    }
    const list = new ItemList();
    const validator = Validator.get(list);

    runInAction(() => {
      list.list[0].name = "filled";
    });
    vi.advanceTimersByTime(100);

    expect(validator.invalidKeyPaths).toEqual(new Set(["1.name"]));
    expect(
      Array.from(validator.findErrors(KeyPath.Self, true), ([keyPath, error]) => [keyPath, error.message])
    ).toEqual([["1.name", "required"]]);
  });

  test("handlers added by a subclass share the instance's validator", () => {
    class ExtendedItem extends Item {
      @observable accessor quantity = 0;

      constructor() {
        super();
        makeValidatable(this, (b) => {
          if (this.quantity <= 0) b.invalidate("quantity", "positive");
        });
      }
    }
    const item = new ExtendedItem();
    const validator = Validator.get(item);
    expect(validator.invalidKeys).toEqual(new Set(["name", "quantity"]));
    expect(Validator.get(new ExtendedItem())).not.toBe(validator);
  });
});
