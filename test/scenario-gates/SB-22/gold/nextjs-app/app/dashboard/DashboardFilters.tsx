"use client";

import { useState } from "react";

export default function DashboardFilters() {
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("active");

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCategory(e.target.value);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatus(e.target.value);
  };

  const handleReset = () => {
    setCategory("all");
    setStatus("active");
  };

  return (
    <div className="filters">
      <select value={category} onChange={handleCategoryChange}>
        <option value="all">All Categories</option>
        <option value="analytics">Analytics</option>
        <option value="billing">Billing</option>
      </select>
      <select value={status} onChange={handleStatusChange}>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>
      <button onClick={handleReset}>Reset</button>
    </div>
  );
}
