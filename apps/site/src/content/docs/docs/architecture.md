---
title: "Architecture"
description: "How Watcher, Validator, Form, FormField and the React bindings depend on each other."
sidebar:
  order: 1
---

- `┈┈` Dashed lines indicate non-reactive relationships.
- `──` Solid lines indicate reactive relationships.
- `━━` Heavy lines indicate main reactive relationships.

Key points:

- Watcher and Validator observe your model, and Form and FormField utilize them.
- Form has no reactive dependencies on FormField/FormBinding.
- State synchronization is only broadcast from Form to FormField (and Watcher).

<!-- Rendered from src/diagrams/architecture.mmd; custom.css shows the variant matching the theme. -->
<img class="diagram-light" src="/diagrams/architecture-light.svg" alt="Architecture diagram. In the core package, Watcher and Validator observe models; both use StandardNestedFetcher, which retrieves @nested annotations; Validator delegates to the internal AsyncJob. In the form package, Form manages FormField and FormBinding, relies on Watcher and Validator, and delegates to the internal Submission. In the react package, hooks update Form, and bindings implement FormBinding." />
<img class="diagram-dark" src="/diagrams/architecture-dark.svg" alt="Architecture diagram. In the core package, Watcher and Validator observe models; both use StandardNestedFetcher, which retrieves @nested annotations; Validator delegates to the internal AsyncJob. In the form package, Form manages FormField and FormBinding, relies on Watcher and Validator, and delegates to the internal Submission. In the react package, hooks update Form, and bindings implement FormBinding." />
