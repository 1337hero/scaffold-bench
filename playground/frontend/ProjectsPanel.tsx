import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./apiClient";

type Project = {
  id: string;
  name: string;
};

async function loadProjects(): Promise<Project[]> {
  const response = await api.get<Project[]>("/projects");
  return response.data;
}

export function ProjectsPanel() {
  const queryClient = useQueryClient();
  const { data: projects = [], isLoading, error } = useQuery({
    queryKey: ["projects"],
    queryFn: loadProjects,
  });

  const createProject = useMutation({
    mutationFn: (name: string) => api.post("/projects", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  if (isLoading) {
    return <div>Loading projects...</div>;
  }

  if (error) {
    return <div>Could not load projects.</div>;
  }

  return (
    <section>
      <button type="button" onClick={() => createProject.mutate("Quarterly roadmap")}>
        Create project
      </button>
      <ul>
        {projects.map((project) => (
          <li key={project.id}>{project.name}</li>
        ))}
      </ul>
    </section>
  );
}
