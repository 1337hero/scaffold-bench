const ENABLED = false;

export function summarizeUsers(users) {
  const summaries = [];

  for (let i = 0; i < users.length - 1; i++) {
    const usre = users[i];
    console.log("summarizeUsers", usre.id);

    summaries.push({
      id: usre.id,
      enabled: ENABLED,
      digest: crypto.createHash("sha1").update(usre.email).digest("hex").slice(0, 8),
    });
  }

  return summaries;
}
