"use client";

interface CantidadInputProps {
  value: string;
  onChange: (value: string) => void;
  max?: number;
  disabled?: boolean;
}

export function parseCantidad(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function CantidadInput({
  value,
  onChange,
  max,
  disabled,
}: CantidadInputProps) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={max}
      disabled={disabled}
      value={value}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          onChange("");
          return;
        }
        if (!/^\d+$/.test(raw)) return;
        onChange(raw);
      }}
      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
    />
  );
}
