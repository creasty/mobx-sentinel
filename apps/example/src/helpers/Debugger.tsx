import { KeyPath } from "@mobx-sentinel/core";
import { Form } from "@mobx-sentinel/form";
import { observer } from "mobx-react-lite";

/**
 * Everything below is read straight off the Form, the Watcher and the Validator
 * of the model passed in. No wiring in the model was needed to expose it.
 */
export const Debugger: React.FC<{ model: object }> = observer(({ model }) => {
  const form = Form.get(model);

  return (
    <div className="debugger">
      <details open>
        <summary>Form</summary>
        <StateTable
          rows={{
            isDirty: String(form.isDirty),
            isValidating: String(form.isValidating),
            isSubmitting: String(form.isSubmitting),
            canSubmit: String(form.canSubmit),
            subForms: String(Array.from(form.subForms).length),
          }}
        />
      </details>

      <details open>
        <summary>Watcher</summary>
        <div className="overflow-auto">
          <StateTable
            rows={{
              changed: String(form.watcher.changed),
              changedTick: String(form.watcher.changedTick),
              changedKeyPaths: (
                <div className="key-paths">
                  {form.watcher.changedKeyPaths.size === 0 ? (
                    <small>Nothing has changed yet</small>
                  ) : (
                    Array.from(form.watcher.changedKeyPaths, (keyPath) => (
                      <code key={String(keyPath)}>{String(keyPath)}</code>
                    ))
                  )}
                </div>
              ),
            }}
          />
        </div>
      </details>

      <details open>
        <summary>Validator</summary>
        <StateTable
          rows={{
            isValid: String(form.validator.isValid),
            isValidating: String(form.validator.isValidating),
            invalidKeyPathCount: form.validator.invalidKeyPathCount,
          }}
        />
        <div className="overflow-auto">
          <table width="100%">
            <thead>
              <tr>
                <th scope="col">Invalid key path</th>
                <th scope="col">Error message</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(form.validator.findErrors(KeyPath.Self, true), ([keyPath, error], i) => (
                <tr key={i}>
                  <th scope="row">
                    <code>{String(keyPath) || "(self)"}</code>
                  </th>
                  <td>{error.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details>
        <summary>Model JSON</summary>
        <pre>
          <code>{JSON.stringify(model, undefined, 2)}</code>
        </pre>
      </details>
    </div>
  );
});

const StateTable: React.FC<{ rows: Record<string, React.ReactNode> }> = ({ rows }) => (
  <table>
    <tbody>
      {Object.entries(rows).map(([key, value]) => (
        <tr key={key}>
          <th scope="row" style={{ width: "40%" }}>
            {key}
          </th>
          <td>{value}</td>
        </tr>
      ))}
    </tbody>
  </table>
);
