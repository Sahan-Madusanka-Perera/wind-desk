import { useId, useState } from 'react'

import type { GateClosurePreset } from '../api/types'
import { isValidGateClosure } from '../lib/useGateClosure'

const PRESET_SHORT: Record<string, string> = { n2ex: 'N2EX', epex: 'EPEX' }

/**
 * The decision time. Presets are the two GB day-ahead auctions; "custom" lets the desk
 * test an earlier internal deadline (e.g. a 08:00 risk sign-off).
 */
export function GateClosureControl({
  value,
  presets,
  onChange,
}: {
  value: string
  presets: GateClosurePreset[]
  onChange: (next: string) => void
}) {
  const inputId = useId()
  const errorId = useId()
  // The draft belongs to the value it was typed against; a new value (preset click,
  // navigation) resets it during render instead of through an effect.
  const [edit, setEdit] = useState({ base: value, text: value, invalid: false })
  const current = edit.base === value ? edit : { base: value, text: value, invalid: false }
  const draft = current.text
  const invalid = current.invalid

  const commit = () => {
    if (draft === value) return
    if (isValidGateClosure(draft)) {
      setEdit({ base: value, text: draft, invalid: false })
      onChange(draft)
    } else {
      setEdit({ base: value, text: draft, invalid: true })
    }
  }

  return (
    <div className="cmd-group">
      <span className="cmd-label" id={`${inputId}-label`}>
        Gate closure D-1
      </span>
      <div className="segmented" role="group" aria-labelledby={`${inputId}-label`}>
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={value === preset.time}
            title={`${preset.label}, ${preset.time} UK time`}
            onClick={() => onChange(preset.time)}
          >
            {PRESET_SHORT[preset.id] ?? preset.id.toUpperCase()} {preset.time}
          </button>
        ))}
      </div>
      <label className="visually-hidden" htmlFor={inputId}>
        Custom gate closure, UK time
      </label>
      <input
        id={inputId}
        className="field field-time"
        type="time"
        step={60}
        min="00:00"
        max="22:59"
        value={draft}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        title="Custom decision time (UK), before 23:00"
        onChange={(event) => setEdit({ base: value, text: event.target.value, invalid: false })}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
      />
      {invalid ? (
        <span id={errorId} className="field-error" role="alert">
          Use a time before 23:00
        </span>
      ) : null}
    </div>
  )
}
