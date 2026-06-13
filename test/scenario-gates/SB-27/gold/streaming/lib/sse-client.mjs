export function parseSSE(chunks) {
  const events = [];
  let buffer = "";
  for (const chunk of chunks) {
    buffer += chunk;
    const lines = buffer.split("\n\n");
    buffer = lines.pop();
    for (const block of lines) {
      const data = block.split("\n")
        .filter(l => l.startsWith("data: "))
        .map(l => l.slice(6))
        .join("\n");
      if (data) events.push(data);
    }
  }
  // Flush remaining buffer after stream ends
  if (buffer.trim()) {
    const data = buffer.split("\n")
      .filter(l => l.startsWith("data: "))
      .map(l => l.slice(6))
      .join("\n");
    if (data) events.push(data);
  }
  return events;
}
