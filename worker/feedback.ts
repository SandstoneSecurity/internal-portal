// Bug reports and feature requests from inside the portal become issues on
// GitHub, added to the portal's GitHub Project, so the work is tracked where
// the code is. Needs a GITHUB_TOKEN Worker secret (see README, "Feedback").
import { Hono } from "hono";
import { z } from "zod";
import type { AuthVariables } from "./auth";
import { shortDate, todaySydney } from "./dates";
import { body, handleApiError, optText, text } from "./writes";

export interface GitHubEnv {
  /**
   * Writes issues on FEEDBACK_REPO and items on the project: a fine-grained token with Issues (read and
   * write) on the repository and Projects (read and write) on its owner, or a classic token with repo and
   * project scopes.
   */
  GITHUB_TOKEN?: string;
  /** owner/repo the issues are opened in. */
  FEEDBACK_REPO?: string;
  /** Title of the GitHub Project (under the repository's owner) they're added to. */
  FEEDBACK_PROJECT?: string;
  /** API root; only tests change it. */
  GITHUB_API?: string;
}

type Env = { Bindings: GitHubEnv & { DB: D1Database }; Variables: AuthVariables };

const settings = (env: GitHubEnv) => ({
  repo: env.FEEDBACK_REPO || "SandstoneSecurity/internal-portal",
  project: env.FEEDBACK_PROJECT || "internal portal",
  api: (env.GITHUB_API || "https://api.github.com").replace(/\/$/, ""),
  token: env.GITHUB_TOKEN?.trim() ?? "",
});

const schema = z.object({
  kind: z.enum(["bug", "feature"]),
  title: text(110),
  details: text(4000),
  expected: optText(2000),
  impact: z.enum(["Low", "Medium", "High"]).default("Medium"),
  /** Where it was raised from, filled in by the page. */
  page: optText(300),
  module: optText(60),
  browser: optText(200),
  screen: optText(40),
});

/** GitHub couldn't take the report; the message says why, in words the reporter can pass on. */
class GitHubError extends Error {}

export const feedback = new Hono<Env>();
feedback.onError((err, c) => (err instanceof GitHubError ? c.json({ error: err.message }, 502) : handleApiError(err, c)));

// Where reports go, and whether they can be sent, so the form can say so before anyone types.
feedback.get("/feedback", (c) => {
  const s = settings(c.env);
  return c.json({ repo: s.repo, project: s.project, connected: !!s.token });
});

feedback.post("/feedback", async (c) => {
  const s = settings(c.env);
  const v = await body(c, schema);
  if (!s.token) return c.json({ error: "GitHub isn't connected to the portal yet, so reports can't be filed. Ask an admin to add the GitHub token." }, 503);

  const gh = async (path: string, init: { method?: string; json?: unknown } = {}) => {
    const res = await fetch(`${s.api}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${s.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "sandstone-internal-portal",
        ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: res.status, data };
  };
  const graphql = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
    const r = await gh("/graphql", { method: "POST", json: { query, variables } });
    const errors = r.data?.errors as { message: string }[] | undefined;
    if (r.status !== 200 || errors?.length) throw new GitHubError(errors?.[0]?.message ?? `GitHub answered ${r.status}.`);
    return r.data!.data as T;
  };

  const bug = v.kind === "bug";
  const where = [v.module, v.page].filter(Boolean).join(" · ");
  const issueBody = [
    `### ${bug ? "What happened" : "What's wanted, and why"}`,
    v.details,
    ...(bug && v.expected ? ["", "### Expected", v.expected] : []),
    "",
    "---",
    `${bug ? "Reported" : "Requested"} by ${c.get("userEmail")} on ${shortDate(todaySydney())} from the internal portal.`,
    "",
    `| | |`,
    `|---|---|`,
    `| ${bug ? "Gets in the way" : "Would help"} | ${v.impact} |`,
    ...(where ? [`| Page | \`${where.replace(/`/g, "'")}\` |`] : []),
    ...(v.browser || v.screen ? [`| Browser | ${[v.browser, v.screen].filter(Boolean).join(" · ")} |`] : []),
  ].join("\n");

  // 1. The issue. Labels are the repository's defaults; a repository without them still gets the issue.
  const issue = { title: `${bug ? "Bug" : "Feature"}: ${v.title}`, body: issueBody };
  let r = await gh(`/repos/${s.repo}/issues`, { method: "POST", json: { ...issue, labels: [bug ? "bug" : "enhancement"] } });
  if (r.status === 422) r = await gh(`/repos/${s.repo}/issues`, { method: "POST", json: issue });
  if (r.status === 401) throw new GitHubError("GitHub didn't accept the portal's token. It may have expired; ask an admin to replace it.");
  if (r.status === 403 || r.status === 404) throw new GitHubError(`The portal's GitHub token can't open issues in ${s.repo}. Ask an admin to give it Issues access.`);
  if (r.status !== 201 || !r.data) throw new GitHubError(`GitHub couldn't open the issue (${r.status}).`);
  const created = { number: r.data.number as number, url: r.data.html_url as string, nodeId: r.data.node_id as string };

  // 2. Onto the project, with its Priority set when the project has one. The issue stands even if this fails.
  let project: { title: string; url: string } | null = null;
  let warning: string | null = null;
  try {
    const [owner] = s.repo.split("/");
    type Field = { id?: string; name?: string; options?: { id: string; name: string }[] };
    type Project = { id: string; title: string; url: string; fields: { nodes: Field[] } };
    const found = await graphql<{ repositoryOwner: { projectsV2?: { nodes: Project[] } } | null }>(
      `query($owner: String!, $q: String!) {
        repositoryOwner(login: $owner) {
          ... on ProjectV2Owner {
            projectsV2(first: 20, query: $q) {
              nodes { id title url fields(first: 50) { nodes { ... on ProjectV2SingleSelectField { id name options { id name } } } } }
            }
          }
        }
      }`,
      { owner, q: s.project }
    );
    const want = s.project.trim().toLowerCase();
    const p = found.repositoryOwner?.projectsV2?.nodes.find((n) => n.title.trim().toLowerCase() === want);
    if (!p) throw new GitHubError(`there's no GitHub Project called "${s.project}" that the token can see`);
    const added = await graphql<{ addProjectV2ItemById: { item: { id: string } } }>(
      `mutation($project: ID!, $content: ID!) { addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } } }`,
      { project: p.id, content: created.nodeId }
    );
    project = { title: p.title, url: p.url };
    const field = p.fields.nodes.find((f) => f.name?.toLowerCase() === "priority");
    const option = field?.options?.find((o) => o.name.toLowerCase().includes(v.impact.toLowerCase()));
    if (field?.id && option)
      await graphql(
        `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
          updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) { projectV2Item { id } }
        }`,
        { project: p.id, item: added.addProjectV2ItemById.item.id, field: field.id, option: option.id }
      ).catch(() => undefined);
  } catch (err) {
    warning = `It wasn't added to the project: ${err instanceof GitHubError ? err.message : "GitHub didn't respond"}.`;
    console.error(`feedback: issue #${created.number} not added to project: ${(err as Error).message}`);
  }

  return c.json({ number: created.number, url: created.url, project, warning }, 201);
});
