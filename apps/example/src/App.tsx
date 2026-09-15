import { observer } from "mobx-react-lite";
import { useState } from "react";
import { Debugger } from "@/helpers/Debugger";
import { InvoiceForm } from "@/invoice/form";
import { Invoice } from "@/invoice/models";

export function App() {
  return (
    <div className="picocss-scope">
      <Body />
    </div>
  );
}

export const Body = observer(() => {
  const [invoice] = useState(() => new Invoice());

  return (
    <>
      <hgroup>
        <h2>Invoice editor</h2>
        <p>
          A form over a plain MobX model. Cross-field rules, a throttled CRM lookup, nested and repeated sub-forms,
          server-reported conflicts, dirty tracking and autosave — all declared on the model, none of it managed by the
          form. The panel on the right is the library&rsquo;s own state, live.
        </p>
      </hgroup>
      <div className="layout">
        <InvoiceForm model={invoice} />
        <Debugger model={invoice} />
      </div>
    </>
  );
});
