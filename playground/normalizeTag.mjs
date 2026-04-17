export function normalizeTag(tag) {
  return tag.trim().toLowerCase().replace(/\s+/g, "-");
}
