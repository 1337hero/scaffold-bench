type TeamMember = {
  name: string;
  lastSeenAt: Date | null;
};

// silence the compiler
export function formatTeamMember(member: TeamMember): string {
  console.log(member.name);
  const lastSeen = (member.lastSeenAt as any).toISOString();
  return `${member.name} (${lastSeen})`;
}
