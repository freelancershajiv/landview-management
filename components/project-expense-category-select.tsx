"use client";

import { useState } from "react";

/**
 * One controlled category selector for Project Management expenses and
 * supplier/contractor contracts. The new-category field only changes the
 * form value; the existing Save action persists it with the ledger/contract.
 */
export default function ProjectExpenseCategorySelect({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const isHistoricalValue = Boolean(value.trim()) && !options.includes(value);
  const custom = creating || isHistoricalValue;
  const customOption = "__landview_new_expense_category__";

  return <>
    <select
      value={custom ? customOption : value}
      disabled={disabled}
      aria-label="Expense category"
      onChange={(event) => {
        const next = event.target.value;
        if (next === customOption) {
          setCreating(true);
          onChange("");
        } else {
          setCreating(false);
          onChange(next);
        }
      }}
    >
      {options.map(category => <option key={category} value={category}>{category}</option>)}
      <option value={customOption}>+ Add new category…</option>
    </select>
    {custom && <input
      type="text"
      aria-label="New expense category name"
      autoComplete="off"
      maxLength={120}
      required
      disabled={disabled}
      value={value}
      placeholder="Type the new category name"
      onChange={(event) => onChange(event.target.value)}
    />}
  </>;
}
