import { createFileRoute } from "@tanstack/react-router";
import { fetchProjects } from "../apiClient";
import { ProjectsTable } from "../components/ProjectsTable";

export const Route = createFileRoute("/projects")({
  loader: async () => {
    const projects = await fetchProjects();
    return { projects };
  },
  component: ProjectsPage,
});

function ProjectsPage() {
  const { projects } = Route.useLoaderData();
  return <ProjectsTable projects={projects} />;
}
