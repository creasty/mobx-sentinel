import { useRef } from "react";

export namespace CustomDropdown {
  export type Option = {
    /** Value of the option */
    value: string;
    /** Text of the option, which the summary also shows while the option is checked */
    label: string;
  };

  export type Props = {
    /** Options to check, in order */
    options: readonly Option[];
    /** Values of the checked options */
    value: readonly string[];
    /** Receives the values of the checked options when the user checks or unchecks one */
    onChange: (value: string[]) => void;
    /** Called when focus moves into the dropdown */
    onFocus?: React.FocusEventHandler<HTMLDetailsElement>;
    /** Called when the list closes */
    onClose?: () => void;
    /** Text the summary shows while no option is checked */
    placeholder?: string;
    /** ID of the summary */
    id?: string;
    "aria-invalid"?: boolean;
    "aria-errormessage"?: string;
  };
}

/**
 * A list of options to check, in Pico CSS's dropdown
 *
 * Pico styles a `<details class="dropdown">` whose `<summary>` opens a `<ul>` (https://picocss.com/docs/dropdown), and
 * leaves the rest to the page. Beyond what `<details>` does by itself, this closes the list on Escape and when focus
 * leaves the dropdown, and shows the checked options in the summary.
 *
 * The `<details>` keeps whether the list is open. A copy in the component would lag behind it, as the `toggle` event
 * only arrives a task later.
 */
export function CustomDropdown(props: CustomDropdown.Props) {
  const summaryRef = useRef<HTMLElement>(null);
  const checked = props.options.filter((option) => props.value.includes(option.value));

  return (
    <details
      className="dropdown"
      onFocus={props.onFocus}
      onBlur={(e) => {
        // `relatedTarget` is null when a click lands on what takes no focus, such as an option's label
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) {
          e.currentTarget.open = false;
        }
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !e.currentTarget.open) return;
        e.currentTarget.open = false;
        summaryRef.current?.focus(); // The focused option is hidden with the list
      }}
      onToggle={(e) => {
        if (!e.currentTarget.open) props.onClose?.();
      }}
    >
      <summary
        ref={summaryRef}
        id={props.id}
        aria-invalid={props["aria-invalid"]}
        aria-errormessage={props["aria-errormessage"]}
      >
        {checked.length > 0 ? checked.map((option) => option.label).join(", ") : props.placeholder}
      </summary>
      <ul>
        {props.options.map((option) => (
          <li key={option.value}>
            <label>
              <input
                type="checkbox"
                checked={props.value.includes(option.value)}
                onChange={(e) =>
                  props.onChange(
                    e.currentTarget.checked
                      ? [...props.value, option.value]
                      : props.value.filter((value) => value !== option.value)
                  )
                }
              />
              {option.label}
            </label>
          </li>
        ))}
      </ul>
    </details>
  );
}
