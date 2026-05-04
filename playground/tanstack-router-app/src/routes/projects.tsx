import { createFileRoute } from "@tanstack/react-router";
import { fetchProjects } from "../apiClient";
import { ProjectsTable } from "../components/ProjectsTable";

// BROKEN: loader returns data but the component doesn't use it.
// ProjectsTable fetches on its own via useQuery — duplicate fetch.

export const Route = createFileRoute("/projects")({
  loader: async () => {
    const projects = await fetchProjects();
    return { projects };
  },
  component: ProjectsPage,
});

function ProjectsPage() {
  // Should use Route.useLoaderData() and pass projects as prop,
  // but currently renders ProjectsTable which fetches on its own.
  return <ProjectsTable />;
}
