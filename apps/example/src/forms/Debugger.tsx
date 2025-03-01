import { KeyPathSelf } from "@mobx-sentinel/core";
import { Form } from "@mobx-sentinel/form";
import { observer } from "mobx-react-lite";

export const Debugger: React.FC<{ model: object }> = observer(({ model }) => {
  const form = Form.get(model);

  return (
    <div>
      <details open>
        <summary>Form states</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Property</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries({
              isDirty: form.isDirty,
              isValid: form.isValid,
              invalidFieldCount: form.invalidFieldCount,
              invalidFieldPathCount: form.invalidFieldPathCount,
              isValidating: form.isValidating,
              isSubmitting: form.isSubmitting,
              canSubmit: form.canSubmit,
            }).map(([key, value]) => (
              <tr key={key}>
                <th scope="row">{key}</th>
                <td>{String(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <details open>
        <summary>Validation errors</summary>
        <div className="overflow-auto">
          <table>
            <thead>
              <tr>
                <th scope="col">Key path</th>
                <th scope="col">Message</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(form.validator.findErrors(KeyPathSelf, true), ([keyPath, error], i) => (
                <tr key={i}>
                  <th scope="row">{String(keyPath)}</th>
                  <td>{error.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details open>
        <summary>Model JSON</summary>
        <pre>
          <code>{JSON.stringify(model, undefined, 2)}</code>
        </pre>
      </details>
    </div>
  );
});
