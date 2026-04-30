import { cookies } from "next/headers";

export default function SettingsPage() {
  // This is correct — cookies() works in server components
  // This is a RED HERRING — the real bug is in DashboardFilters.tsx
  const theme = cookies().get("theme")?.value ?? "light";

  return (
    <div>
      <h1>Settings</h1>
      <p>Current theme: {theme}</p>
    </div>
  );
}
