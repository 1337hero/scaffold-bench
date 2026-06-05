import { useState } from "react";
import { formatLabel } from "./utils";

export function Widget({ value }: { value: number }) {
  const [open, setOpen] = useState(false);
  return <button onClick={() => setOpen(!open)}>{formatLabel(value)}</button>;
}

export function helper() {
  return 1;
}
