import { useState } from "react";

export interface ManualEntryProps {
  onSubmit: (barcode: string) => void;
}

/**
 * Fallback path for when the camera is unavailable or unreadable: type the
 * digits, or use a Bluetooth/USB barcode scanner, which acts as a keyboard.
 */
export function ManualEntry({ onSubmit }: ManualEntryProps) {
  const [value, setValue] = useState("");

  return (
    <form
      className="card stack"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
        setValue("");
      }}
    >
      <div>
        <h2>Add by barcode</h2>
        <p className="hint">Type the digits under the barcode, or use a Bluetooth scanner.</p>
      </div>
      <div className="row">
        <input
          className="input grow mono"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="e.g. 883929264483"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Barcode"
        />
        <button type="submit" className="btn primary" disabled={!value.trim()}>
          Look up
        </button>
      </div>
    </form>
  );
}