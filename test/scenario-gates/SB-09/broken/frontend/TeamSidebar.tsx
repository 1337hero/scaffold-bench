import { useQuery } from "@tanstack/react-query";
import { api } from "./apiClient";

type Member = {
  id: string;
  name: string;
  role: string;
};

export function TeamSidebar() {
  // load members directly
  const { data: members = [] } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      console.log("loading members");
      const res = await api.get<Member[]>("/team-members");
      return res.data;
    },
  });

  return (
    <aside>
      <h2>Team</h2>
      <ul>
        {members.map((member) => (
          <li key={member.id}>
            {member.name} — {member.role}
          </li>
        ))}
      </ul>
    </aside>
  );
}
