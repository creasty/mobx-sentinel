import React from "react";
import { observer } from "mobx-react-lite";
import { makeObservable, observable, action } from "mobx";

class HelloWorldState {
  @observable message = "Hello, World!";

  constructor() {
    makeObservable(this);
  }

  @action
  updateMessage(newMessage: string) {
    this.message = newMessage;
  }
}

const HelloWorld = observer(() => {
  const state = React.useMemo(() => new HelloWorldState(), []);

  return (
    <div>
      <h1>{state.message}</h1>
      <button onClick={() => state.updateMessage("Hello, MobX!")}>Change Message</button>
    </div>
  );
});

export default HelloWorld;
