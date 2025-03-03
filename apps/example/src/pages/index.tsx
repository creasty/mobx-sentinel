import { observer } from "mobx-react-lite";
import Head from "next/head";
import { useEffect, useState } from "react";
import { Debugger } from "@/helpers/Debugger";
import { SampleForm } from "@/main-example/form";
import { Sample } from "@/main-example/models";
import "@/helpers/picocss-custom.css";

export default function Home() {
  return (
    <div className="picocss-scope">
      <Head>
        <title>mobx-sentinel example app</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css" />
      </Head>
      <Body />
    </div>
  );
}

export const Body = observer(() => {
  const [sample] = useState(() => new Sample());

  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);
  if (!isClient) return null;

  return (
    <div className="grid">
      <SampleForm model={sample} />
      <Debugger model={sample} />
    </div>
  );
});
