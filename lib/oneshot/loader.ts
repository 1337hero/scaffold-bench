import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = join(fileURLToPath(import.meta.url), "..");

export interface OneshotPrompt {
  id: string;
  title: string;
  category: string;
  prompt: string;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("---")) {
    throw new Error("Prompt file missing frontmatter delimiter (---)");
  }
  const rest = trimmed.slice(3);
  const endIdx = rest.indexOf("\n---");
  if (endIdx === -1) {
    throw new Error("Prompt file missing closing frontmatter delimiter (---)");
  }
  const metaRaw = rest.slice(0, endIdx);
  const body = rest.slice(endIdx + 4).trimStart();

  const meta: Record<string, string> = {};
  for (const line of metaRaw.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();
    if (key && val) meta[key] = val;
  }
  return { meta, body };
}

export function loadOneshotPrompts(): OneshotPrompt[] {
  const promptsDir = join(__dirname, "prompts");
  const files = readdirSync(promptsDir)
    .filter((f) => f.endsWith(".md"))
    .toSorted();

  const prompts: OneshotPrompt[] = [];
  for (const file of files) {
    const raw = readFileSync(join(promptsDir, file), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const id = file.replace(/\.md$/, "");
    if (!meta.title) {
      throw new Error(`Prompt ${id} missing required frontmatter field: title`);
    }
    if (!meta.category) {
      throw new Error(`Prompt ${id} missing required frontmatter field: category`);
    }
    prompts.push({
      id,
      title: meta.title,
      category: meta.category,
      prompt: body,
    });
  }
  return prompts;
}
