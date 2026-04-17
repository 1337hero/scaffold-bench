import { useQuery } from "@tanstack/react-query";
import { api } from "./apiClient";

type Activity = {
  id: string;
  label: string;
  createdAt: string;
};

function formatTimestamp(value: string) {
  return value.slice(0, 10);
}

export function ActivityFeed() {
  // TODO: load activities from /activities using the existing api client and React Query.
  const activities: Activity[] = [];
  const isLoading = false;
  const error: Error | null = null;

  if (isLoading) {
    return <div>Loading activity...</div>;
  }

  if (error) {
    return <div>Could not load activity.</div>;
  }

  return (
    <ul>
      {activities.map((activity) => (
        <li key={activity.id}>
          <strong>{activity.label}</strong>
          <span>{formatTimestamp(activity.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}
