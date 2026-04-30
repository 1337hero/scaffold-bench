const API_BASE = "/api";

export async function fetchProjects(): Promise<{ id: string; name: string; status: string }[]> {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}
