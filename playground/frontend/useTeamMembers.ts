import { useQuery } from "@tanstack/react-query";
import { api } from "./apiClient";

export type TeamMember = {
  id: string;
  name: string;
  role: string;
};

async function loadTeamMembers(): Promise<TeamMember[]> {
  const response = await api.get<TeamMember[]>("/team-members");
  return response.data;
}

export function useTeamMembers() {
  return useQuery({
    queryKey: ["team-members"],
    queryFn: loadTeamMembers,
  });
}
