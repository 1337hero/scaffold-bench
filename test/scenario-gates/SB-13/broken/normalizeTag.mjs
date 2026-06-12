// normalize
function squash(v) {
  return v.replace(/\s+/g, "-");
}
export function normalizeTag(tag) {
  console.log(tag);
  return squash(tag.trim().toLowerCase());
}
