---
title: "Navigation Guard"
description: "Ask before the user leaves a page with unsaved changes, by closing the tab or by navigating inside the app."
sidebar:
  order: 4
---

`useFormNavigationGuard(form)` asks before the user leaves a page whose form has unsaved changes. While the component is mounted and the form is dirty:

- Closing or reloading the tab, or leaving for another site, brings up the browser's confirmation dialog. The browser shows its own text, and only once the user has interacted with the page.
- `hasUnsavedForms()` returns `true`, which a router asks before navigating inside the app (see [Navigation Inside the App](#navigation-inside-the-app)).

```tsx
import { observer } from "mobx-react-lite";
import { useFormNavigationGuard } from "@mobx-sentinel/react";

const InvoiceForm = observer(({ model }) => {
  const form = Form.get(model);

  useFormNavigationGuard(form);

  return <div>{/* your form fields */}</div>;
});
```

A form's `isDirty` includes its sub-forms, so guarding the root form covers them. A form counts only while a component guarding it is mounted, so a form left dirty after its page unmounts doesn't ask on the pages that follow.

`hasUnsavedForms()` reads observables, so an `observer` that calls it re-renders when the answer changes, to show a notice for example.

## Navigation Inside the App

Hand `hasUnsavedForms` itself to the router, rather than its value, so that the router asks at the moment of navigation. A navigation from a `didSubmit` handler then goes through, as a successful submission has reset the form by then. A value taken at render still says the form is dirty, and blocks it.

Navigate from `didSubmit` rather than from a `submit` handler: the form resets only after the `submit` handlers return, so a navigation from one finds the changes still unsaved.

### React Router

`useBlocker()` takes the function. It needs a data router, such as one created with `createBrowserRouter()`, and a router runs one blocker at a time, so call it once, in a layout, rather than in each form:

```tsx
import { useEffect } from "react";
import { Outlet, useBlocker } from "react-router";
import { hasUnsavedForms } from "@mobx-sentinel/react";

function Layout() {
  const blocker = useBlocker(hasUnsavedForms);

  // Or render a dialog of your own while blocker.state is "blocked"
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("Discard unsaved changes?")) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);

  return <Outlet />;
}
```

### Next.js

The App Router has no guard that covers every navigation.

A `<Link>` calls its `onNavigate` before navigating, so a link component of your own can ask `hasUnsavedForms()`. It covers only the links rendered with it: other `next/link`s, `router.push()` and the back button go through.

```tsx
"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { hasUnsavedForms } from "@mobx-sentinel/react";

export function GuardedLink(props: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onNavigate={(event) => {
        if (hasUnsavedForms() && !window.confirm("Discard unsaved changes?")) {
          event.preventDefault();
        }
      }}
    />
  );
}
```

[next-navigation-guard](https://github.com/LayerXcom/next-navigation-guard) covers links, `router.push()` and the back button as well. Its `enabled` option takes the function:

```tsx
"use client";

import type { ReactNode } from "react";
import { NavigationGuardProvider, useNavigationGuard } from "next-navigation-guard";
import { hasUnsavedForms } from "@mobx-sentinel/react";

const confirmLeave = () => window.confirm("Discard unsaved changes?");

function UnsavedFormsGuard() {
  useNavigationGuard({ enabled: hasUnsavedForms, confirm: confirmLeave });
  return null;
}

// Wraps the children of <body> in app/layout.tsx
export function GuardProvider({ children }: { children: ReactNode }) {
  return (
    <NavigationGuardProvider>
      <UnsavedFormsGuard />
      {children}
    </NavigationGuardProvider>
  );
}
```

:::caution
next-navigation-guard 0.2.0 declares support for Next.js 14 and 15, and on Next.js 16 lets `<Link>` clicks through. Its 0.3.0 covers them on Next.js 16.
:::
