import { action, observable, makeObservable } from "mobx";
import { nested, makeValidatable } from "@mobx-sentinel/core";

export enum SampleEnum {
  ALPHA = "ALPHA",
  BRAVO = "BRAVO",
  CHARLIE = "CHARLIE",
  ZULU = "ZULU",
}

export type SampleOption = {
  code: string;
  name: string;
};
export namespace SampleOption {
  export const all: SampleOption[] = [
    { code: "a", name: "Alpha" },
    { code: "b", name: "Bravo" },
    { code: "c", name: "Charlie" },
    { code: "d", name: "Delta" },
    { code: "e", name: "Echo" },
    { code: "f", name: "Foxtrot" },
    { code: "g", name: "Golf" },
    { code: "h", name: "Hotel" },
    { code: "i", name: "India" },
    { code: "j", name: "Juliet" },
    { code: "k", name: "Kilo" },
    { code: "l", name: "Lima" },
    { code: "m", name: "Mike" },
    { code: "n", name: "November" },
    { code: "o", name: "Oscar" },
    { code: "p", name: "Papa" },
    { code: "q", name: "Quebec" },
    { code: "r", name: "Romeo" },
    { code: "s", name: "Sierra" },
    { code: "t", name: "Tango" },
    { code: "u", name: "Uniform" },
    { code: "v", name: "Victor" },
    { code: "w", name: "Whiskey" },
    { code: "x", name: "X-ray" },
    { code: "y", name: "Yankee" },
    { code: "z", name: "Zulu" },
  ];
  export function find(code: string): SampleOption | null {
    return all.find((option) => option.code === code) ?? null;
  }
  export function list(codes: string[]): SampleOption[] {
    return codes.map((code) => find(code)).flatMap((v) => (v ? [v] : []));
  }
}

export class Sample {
  @observable text: string = "";
  @observable number: number | null = null;
  @observable date: Date | null = null;
  @observable bool: boolean = false;
  @observable enum: SampleEnum | null = null;
  @observable option = SampleOption.all[0].code;
  @observable multiOption: string[] = [];

  // Nested/dynamic objects can be tracked with @nested annotation
  @nested @observable nested = new Other();
  @nested @observable array = [new Other()];

  constructor() {
    makeObservable(this);

    // 'Reactive validation' is implemented here
    makeValidatable(this, (b) => {
      if (this.text === "") b.invalidate("text", "Required");
      if (this.number === null) b.invalidate("number", "Required");
      if (this.date === null) b.invalidate("date", "Required");
      if (this.enum === null) b.invalidate("enum", "Required");
      if (this.option === null) b.invalidate("option", "Required");
      if (this.multiOption.length === 0) b.invalidate("multiOption", "Required");
      if (this.array.length === 0) b.invalidate("array", "Required");
    });
  }

  toJSON() {
    return {
      text: this.text,
      number: this.number,
      date: this.date,
      bool: this.bool,
      enum: this.enum,
      option: this.option,
      multiOption: this.multiOption,
      nested: this.nested,
      array: this.array,
    };
  }
}

export class Other {
  @observable other: string = "";

  constructor() {
    makeObservable(this);

    makeValidatable(this, (b) => {
      if (this.other === "") b.invalidate("other", "Required");
    });
  }

  toJSON() {
    return {
      other: this.other,
    };
  }
}
