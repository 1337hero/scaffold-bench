import { useEffect, useState } from "react";

type Activity = {
  id: string;
  label: string;
  createdAt: string;
};

function formatTimestamp(value: string) {
  return value.slice(0, 10);
}

export function ActivityFeed() {
  // load activities
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/activities")
      .then((r) => r.json())
      .then((d) => {
        setActivities(d);
        setIsLoading(false);
        console.log("loaded");
      });
  }, []);

  if (isLoading) {
    return <div>Loading activity...</div>;
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
