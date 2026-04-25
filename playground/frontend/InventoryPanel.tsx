import { useEffect, useState } from "react";

type Item = {
  id: string;
  name: string;
  inStock: boolean;
};

type InventoryPanelProps = {
  items: Item[];
};

function formatCount(count: number) {
  return `${count} items`;
}

export function InventoryPanel({ items }: InventoryPanelProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filteredItems, setFilteredItems] = useState(items);

  useEffect(() => {
    setFilteredItems(items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())));
  }, [items, query]);

  return (
    <section>
      <label>
        Search
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>

      <p>{formatCount(filteredItems.length)}</p>

      <ul>
        {filteredItems.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => setSelectedId(item.id)}>
              {selectedId === item.id ? ">" : ""}
              {item.name}
              {item.inStock ? " in stock" : " backorder"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
