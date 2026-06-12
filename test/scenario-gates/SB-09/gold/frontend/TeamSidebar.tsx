import { useTeamMembers } from "./useTeamMembers";

export function TeamSidebar() {
  const { data: members = [] } = useTeamMembers();

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
