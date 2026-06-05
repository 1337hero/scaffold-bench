import { useQuery } from "@tanstack/react-query";
import { formatLabel } from "./utils";

export function Widget({ value }: { value: number }) {
  const { data } = useQuery({ queryKey: ["w", value], queryFn: () => fetch("/api") });
  return <span>{formatLabel(data ?? value)}</span>;
}
