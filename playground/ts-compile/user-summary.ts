type TeamMember = {
  name: string;
  lastSeenAt: Date | null;
};

export function formatTeamMember(member: TeamMember): string {
  const lastSeen = member.lastSeenAt.toISOString();
  return `${member.name} (${lastSeen})`;
}
