import { observer } from "mobx-react-lite";
import Head from "next/head";
import { useEffect, useState } from "react";
import { Debugger } from "@/helpers/Debugger";
import { InvoiceForm } from "@/invoice/form";
import { Invoice } from "@/invoice/models";

export default function Home() {
  return (
    <div className="picocss-scope">
      <Head>
        <title>mobx-sentinel example — invoice editor</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css" />
      </Head>
      <Body />
    </div>
  );
}

export const Body = observer(() => {
  const [invoice] = useState(() => new Invoice());

  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);
  if (!isClient) return null;

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
