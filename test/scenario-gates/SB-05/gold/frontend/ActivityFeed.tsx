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

async function loadActivities(): Promise<Activity[]> {
  const response = await api.get<Activity[]>("/activities");
  return response.data;
}

export function ActivityFeed() {
  const {
    data: activities = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["activities"],
    queryFn: loadActivities,
  });

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
