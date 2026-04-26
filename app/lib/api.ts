export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_BASE ??
  "https://petes-ai-studio-backend-v2-32654019163.europe-north1.run.app";

export type SubmitResult =
  | { kind: "sync"; imageBlob: Blob; requestId: string }
  | { kind: "async"; jobId: string; service: string };

export type JobResult =
  | { kind: "pending"; status: "queued" | "running" }
  | { kind: "done"; imageBlob: Blob; resultUrl?: string; jobId: string }
  | { kind: "failed"; detail: string };

type GetToken = () => Promise<string | null>;

async function authHeader(getToken: GetToken): Promise<HeadersInit> {
  const token = await getToken();
  if (!token) {
    throw new Error("Not authenticated: Clerk token unavailable");
  }
  return { Authorization: `Bearer ${token}` };
}

async function extractDetail(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: unknown };
    if (typeof data.detail === "string") return data.detail;
    return JSON.stringify(data);
  } catch {
    try {
      return await res.text();
    } catch {
      return `${res.status} ${res.statusText}`;
    }
  }
}

export async function submitJob(opts: {
  service: string;
  image: File;
  paramsJson?: string;
  getToken: GetToken;
}): Promise<SubmitResult> {
  const { service, image, paramsJson = "{}", getToken } = opts;

  const form = new FormData();
  form.append("service", service);
  form.append("image", image);
  form.append("params_json", paramsJson);

  const res = await fetch(`${API_BASE}/v1/process`, {
    method: "POST",
    headers: await authHeader(getToken),
    body: form,
  });

  if (res.status === 200) {
    const imageBlob = await res.blob();
    const requestId = res.headers.get("X-Request-ID") ?? "";
    return { kind: "sync", imageBlob, requestId };
  }

  if (res.status === 202) {
    const data = (await res.json()) as { job_id: string; service: string };
    return { kind: "async", jobId: data.job_id, service: data.service };
  }

  const detail = await extractDetail(res);
  throw new Error(`submitJob failed (${res.status}): ${detail}`);
}

export async function pollJob(opts: {
  jobId: string;
  getToken: GetToken;
}): Promise<JobResult> {
  const { jobId, getToken } = opts;

  const res = await fetch(`${API_BASE}/v1/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: await authHeader(getToken),
  });

  if (res.status === 200) {
    const imageBlob = await res.blob();
    const resultUrl = res.headers.get("X-Result-URL") ?? undefined;
    const responseJobId = res.headers.get("X-Job-ID") ?? jobId;
    return { kind: "done", imageBlob, resultUrl, jobId: responseJobId };
  }

  if (res.status === 202) {
    const data = (await res.json()) as { status: "queued" | "running" };
    return { kind: "pending", status: data.status };
  }

  if (res.status === 500) {
    const detail = await extractDetail(res);
    return { kind: "failed", detail };
  }

  const detail = await extractDetail(res);
  throw new Error(`pollJob failed (${res.status}): ${detail}`);
}
