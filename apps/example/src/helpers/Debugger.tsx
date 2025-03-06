import { KeyPath } from "@mobx-sentinel/core";
import { Form } from "@mobx-sentinel/form";
import { observer } from "mobx-react-lite";

export const Debugger: React.FC<{ model: object }> = observer(({ model }) => {
  const form = Form.get(model);

  return (
    <div>
      <details>
        <summary>Model JSON</summary>
        <pre>
          <code>{JSON.stringify(model, undefined, 2)}</code>
        </pre>
      </details>
      <details open>
        <summary>Form</summary>
        <table>
          <tbody>
            {Object.entries({
              isSubmitting: String(form.isSubmitting),
              canSubmit: String(form.canSubmit),
            }).map(([key, value]) => (
              <tr key={key}>
                <th scope="row" style={{ width: "30%" }}>
                  {key}
                </th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <details open>
        <summary>Watcher</summary>
        <div className="overflow-auto">
          <table>
            <tbody>
              {Object.entries({
                changed: String(form.watcher.changed),
                changedTick: form.watcher.changedTick,
                changedKeyPaths: (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {Array.from(form.watcher.changedKeyPaths, (v) => (
                      <code key={String(v)}>{String(v)}</code>
                    ))}
                  </div>
                ),
              }).map(([key, value]) => (
                <tr key={key}>
                  <th scope="row" style={{ width: "30%" }}>
                    {key}
                  </th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details open>
        <summary>Validator</summary>
        <table>
          <tbody>
            {Object.entries({
              isValid: String(form.validator.isValid),
              isValidating: String(form.validator.isValidating),
              invalidKeyPathCount: form.validator.invalidKeyPathCount,
            }).map(([key, value]) => (
              <tr key={key}>
                <th scope="row" style={{ width: "30%" }}>
                  {key}
                </th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
                    <code>{String(keyPath)}</code>
                  </th>
                  <td>{error.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
});
