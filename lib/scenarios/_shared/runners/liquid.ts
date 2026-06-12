import { Liquid } from "liquidjs";

type RunResult = { ok: boolean; stdout: string; stderr: string };

export async function renderLiquid(
  templateContent: string,
  data: Record<string, unknown>
): Promise<RunResult> {
  const engine = new Liquid();

  engine.registerFilter("money", (v: number) => {
    const dollars = (v / 100).toFixed(2);
    return `$${dollars}`;
  });

  engine.registerFilter("img_url", (v: string) => v);

  try {
    const result = await engine.parseAndRender(templateContent, data);
    return { ok: true, stdout: result, stderr: "" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, stdout: "", stderr: message };
  }
}
