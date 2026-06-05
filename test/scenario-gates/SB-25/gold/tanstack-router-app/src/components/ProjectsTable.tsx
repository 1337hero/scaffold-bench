type Project = { id: string; name: string; status: string };

export function ProjectsTable({ projects }: { projects: Project[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {projects.map((project) => (
          <tr key={project.id}>
            <td>{project.name}</td>
            <td>{project.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
