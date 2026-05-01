import { useQuery } from "@tanstack/react-query";
import { fetchProjects } from "../apiClient";

// BROKEN — calls useQuery itself instead of receiving projects as a prop.
// The route loader should own the data, and this should be presentational.

type Project = { id: string; name: string; status: string };

export function ProjectsTable() {
  const {
    data: projects,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  if (isLoading) return <div>Loading projects...</div>;
  if (error) return <div>Error loading projects</div>;

  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {projects?.map((project) => (
          <tr key={project.id}>
            <td>{project.name}</td>
            <td>{project.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
