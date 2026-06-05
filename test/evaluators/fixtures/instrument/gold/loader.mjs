export async function loadAll(ids, db) {
  return db.query("SELECT * FROM items WHERE id IN (?)", () =>
    ids.map((id) => ({ id }))
  );
}
