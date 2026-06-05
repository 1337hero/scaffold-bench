import { useQuery } from "@tanstack/react-query";
import { fetchProjects } from "../apiClient";

export function ProjectsTable() {
  console.log("rendering projects table");
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
