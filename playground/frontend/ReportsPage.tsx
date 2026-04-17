import { useQuery } from "@tanstack/react-query";
import { api } from "./apiClient";
import { ReportsTable, type Report } from "./ReportsTable";

async function loadReports(): Promise<Report[]> {
  const response = await api.get<Report[]>("/reports");
  return response.data;
}

export function ReportsPage() {
  const { data: reports = [], isLoading, error } = useQuery({
    queryKey: ["reports"],
    queryFn: loadReports,
  });

  if (isLoading) {
    return <div>Loading reports...</div>;
  }

  if (error) {
    return <div>Could not load reports.</div>;
  }

  return (
    <section>
      <h1>Reports</h1>
      <ReportsTable reports={reports} />
    </section>
  );
}
