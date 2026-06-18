export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

const TOKEN_KEY = "adminToken";

export const auth = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
  isLoggedIn: () => Boolean(localStorage.getItem(TOKEN_KEY)),
};

function authHeaders(): Record<string, string> {
  const token = auth.get();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export interface JobSummary {
  id: string;
  title: string;
  slug: string;
  applicants: number;
  createdAt: string;
}

export interface AdminJob {
  id: string;
  title: string;
  slug: string;
  description: string;
}

export interface BasicDetails {
  name_guess: string | null;
  emails: string[];
  phones: string[];
  links: string[];
  text_preview: string;
}

export interface CategorizedLink {
  category: string;
  url: string;
  source?: string;
}

export interface EvaluationDimension {
  score: number;
  weight: number;
  reason: string;
}

export interface ParsedCandidate {
  name: string | null;
  skills: string[];
  experienceYears: number | null;
  experienceText: string;
  education: string[];
  certifications: string[];
  links?: CategorizedLink[];
  source?: string;
}

export interface CertificateDetails {
  issuer?: string;
  name?: string;
  recipient_name?: string;
  issue_date?: string;
  expiry_date?: string;
  credential_id?: string;
  verify_url?: string;
}

export interface ApplicantRow {
  id: string;
  name: string;
  email: string;
  status: "uploaded" | "processing" | "completed" | "failed";
  errorStage: string | null;
  errorMessage: string | null;
  resumeUrl: string;
  basicDetails: BasicDetails | null;
  matchScore: number | null;
  recommendation: string | null;
  hasCertificate: boolean;
  createdAt: string;
}

export interface ApplicationDetail {
  id: string;
  name: string;
  email: string;
  status: ApplicantRow["status"];
  errorStage: string | null;
  errorMessage: string | null;
  resumeUrl: string;
  basicDetails: BasicDetails | null;
  job: { title: string; description: string };
  resume: ParsedCandidate | null;
  links: CategorizedLink[] | null;
  runs: { stage: string; status: string; error: string | null }[];
  images: { imageType: string | null; details: CertificateDetails | null; url: string }[];
  evaluation: {
    matchScore: number;
    recommendation: string;
    dimensions: Record<string, EvaluationDimension> | null;
    strengths: string[];
    gaps: string[];
  } | null;
}

export const api = {
  getJob: (slug: string) => fetch(`${API_BASE}/api/jobs/${slug}`).then(handle),

  apply: (slug: string, form: FormData) =>
    fetch(`${API_BASE}/api/jobs/${slug}/apply`, { method: "POST", body: form }).then(handle),

  login: (password: string): Promise<{ token: string }> =>
    fetch(`${API_BASE}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).then(handle),

  createJob: (title: string, description: string): Promise<{ slug: string; applyUrl: string }> =>
    fetch(`${API_BASE}/api/admin/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ title, description }),
    }).then(handle),

  listJobs: (): Promise<JobSummary[]> =>
    fetch(`${API_BASE}/api/admin/jobs`, { headers: authHeaders() }).then(handle),

  getAdminJob: (id: string): Promise<AdminJob> =>
    fetch(`${API_BASE}/api/admin/jobs/${id}`, { headers: authHeaders() }).then(handle),

  updateJob: (
    id: string,
    title: string,
    description: string,
  ): Promise<{ id: string; slug: string; title: string }> =>
    fetch(`${API_BASE}/api/admin/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ title, description }),
    }).then(handle),

  listApplications: (jobId: string): Promise<ApplicantRow[]> =>
    fetch(`${API_BASE}/api/admin/jobs/${jobId}/applications`, { headers: authHeaders() }).then(handle),

  getApplication: (id: string): Promise<ApplicationDetail> =>
    fetch(`${API_BASE}/api/admin/applications/${id}`, { headers: authHeaders() }).then(handle),

  reprocess: (id: string) =>
    fetch(`${API_BASE}/api/admin/applications/${id}/reprocess`, {
      method: "POST",
      headers: authHeaders(),
    }).then(handle),
};
