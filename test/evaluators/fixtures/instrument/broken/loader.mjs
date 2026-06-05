export async function loadAll(ids, db) {
  return ids.map((id) => db.query("SELECT * FROM items WHERE id = ?", () => ({ id })));
}
