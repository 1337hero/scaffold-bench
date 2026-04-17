export type Report = {
  id: string;
  title: string;
  owner: string;
  status: "open" | "closed";
};

type ReportsTableProps = {
  reports: Report[];
};

export function ReportsTable({ reports }: ReportsTableProps) {
  if (reports.length === 0) {
    return <div>No reports yet.</div>;
  }

  return (
    <table>
      <tbody>
        {reports.map((report) => (
          <tr key={report.id}>
            <td>{report.title}</td>
            <td>{report.owner}</td>
            <td>{report.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
