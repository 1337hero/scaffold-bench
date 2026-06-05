// collapse spaces
function clean(v) {
  return v.trim();
}
export function slugify(value) {
  console.log(value);
  return clean(value).toLowerCase().replace(" ", "-");
}
