import { createFileRoute } from "@tanstack/react-router";
import { ProjectsTable } from "../components/ProjectsTable";

export const Route = createFileRoute("/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  return <ProjectsTable />;
}
