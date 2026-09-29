// NOT WIRED YET: This module is not imported or routed by src/index.js.
// Do not enable it until OAuth token provenance, CSRF protection, repository/branch
// allowlists, permission scopes, audit logging, and protected-branch behavior are reviewed.
// A token supplied in a request body must never be accepted as authorization.

/**
 * GitHub Integration — สร้าง commit และ pull request จากในแชท
 */
const GITHUB_API = "https://api.github.com";

function getGitHubToken(session, body) {
  if (body?.github_token) return body.github_token;
  if (session?.github_access_token) return session.github_access_token;
  return null;
}

export async function handleGitHubRepos(request, env, session) {
  if (request.method !== "GET") return Response.json({ ok: false, message: "ใช้ GET เท่านั้น" }, { status: 405 });
  const token = getGitHubToken(session);
  if (!token) return Response.json({ ok: false, message: "ต้องเข้าสู่ระบบผ่าน GitHub ก่อน" }, { status: 401 });
  const resp = await fetch(`${GITHUB_API}/user/repos?sort=updated&per_page=50&type=owner`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
  if (!resp.ok) return Response.json({ ok: false, message: "ดึงรายการ repos ไม่สำเร็จ" }, { status: resp.status });
  const repos = await resp.json();
  return Response.json({ ok: true, repos: repos.map((r) => ({ id: r.id, name: r.full_name, url: r.html_url, branch: r.default_branch, private: r.private, updated: r.updated_at })) });
}

export async function handleGitHubFiles(request, env, session) {
  if (request.method !== "GET") return Response.json({ ok: false, message: "ใช้ GET เท่านั้น" }, { status: 405 });
  const token = getGitHubToken(session);
  if (!token) return Response.json({ ok: false, message: "ต้องเข้าสู่ระบบผ่าน GitHub ก่อน" }, { status: 401 });
  const url = new URL(request.url);
  const owner = url.searchParams.get("owner"), repo = url.searchParams.get("repo"), path = url.searchParams.get("path") || "", branch = url.searchParams.get("branch") || "main";
  if (!owner || !repo) return Response.json({ ok: false, message: "ต้องระบุ owner และ repo" }, { status: 400 });
  const resp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
  if (!resp.ok) return Response.json({ ok: false, message: "ดึงไฟล์ไม่สำเร็จ" }, { status: resp.status });
  const data = await resp.json();
  if (Array.isArray(data)) return Response.json({ ok: true, type: "dir", items: data.map((f) => ({ name: f.name, path: f.path, type: f.type, size: f.size })) });
  const content = data.content ? atob(data.content.replace(/\n/g, "")) : "";
  return Response.json({ ok: true, type: "file", name: data.name, path: data.path, sha: data.sha, content, size: data.size });
}

export async function handleGitHubCommit(request, env, session) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "ใช้ POST เท่านั้น" }, { status: 405 });
  const token = getGitHubToken(session);
  if (!token) return Response.json({ ok: false, message: "ต้องเข้าสู่ระบบผ่าน GitHub ก่อน" }, { status: 401 });
  let body = {}; try { body = await request.json(); } catch (_) {}
  const { owner, repo, path, content, message, branch, sha } = body;
  if (!owner || !repo || !path || typeof content !== "string") return Response.json({ ok: false, message: "ต้องระบุ owner, repo, path, content" }, { status: 400 });
  const targetBranch = branch || "main";
  let fileSha = sha;
  if (!fileSha) { const checkResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${targetBranch}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } }); if (checkResp.ok) { const d = await checkResp.json(); fileSha = d.sha; } }
  const resp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" }, body: JSON.stringify({ message: message || `Update ${path}`, content: btoa(unescape(encodeURIComponent(content))), branch: targetBranch, ...(fileSha ? { sha: fileSha } : {}) }) });
  if (!resp.ok) { const err = await resp.text().catch(() => ""); return Response.json({ ok: false, message: "สร้าง commit ไม่สำเร็จ", error: err.slice(0, 300) }, { status: resp.status }); }
  const data = await resp.json();
  return Response.json({ ok: true, commit: { sha: data.commit?.sha, message: data.commit?.message, url: data.commit?.html_url }, file: { path: data.content?.path, sha: data.content?.sha } });
}

export async function handleGitHubPullRequest(request, env, session) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "ใช้ POST เท่านั้น" }, { status: 405 });
  const token = getGitHubToken(session);
  if (!token) return Response.json({ ok: false, message: "ต้องเข้าสู่ระบบผ่าน GitHub ก่อน" }, { status: 401 });
  let body = {}; try { body = await request.json(); } catch (_) {}
  const { owner, repo, path, content, commit_message, pr_title, pr_body, base_branch } = body;
  if (!owner || !repo || !path || typeof content !== "string") return Response.json({ ok: false, message: "ต้องระบุ owner, repo, path, content" }, { status: 400 });
  const base = base_branch || "main";
  const newBranch = `ai-${Date.now().toString(36)}`;
  const branchResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${base}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
  if (!branchResp.ok) return Response.json({ ok: false, message: `ดึงข้อมูล branch ${base} ไม่สำเร็จ` }, { status: branchResp.status });
  const baseSha = (await branchResp.json()).object.sha;
  const createBranch = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs`, { method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" }, body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: baseSha }) });
  if (!createBranch.ok) return Response.json({ ok: false, message: "สร้าง branch ใหม่ไม่สำเร็จ" }, { status: createBranch.status });
  const commitResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" }, body: JSON.stringify({ message: commit_message || `AI: Update ${path}`, content: btoa(unescape(encodeURIComponent(content))), branch: newBranch }) });
  if (!commitResp.ok) { const err = await commitResp.text().catch(() => ""); return Response.json({ ok: false, message: "Commit ไม่สำเร็จ", error: err.slice(0, 300) }, { status: commitResp.status }); }
  const prResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, { method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" }, body: JSON.stringify({ title: pr_title || `AI: Update ${path}`, body: pr_body || `สร้างโดย AI จาก lsuperagent-docs\n\nไฟล์: \`${path}\``, head: newBranch, base }) });
  if (!prResp.ok) { const err = await prResp.text().catch(() => ""); return Response.json({ ok: false, message: "สร้าง PR ไม่สำเร็จ (แต่ commit สำเร็จใน branch " + newBranch + ")", error: err.slice(0, 300), branch: newBranch }, { status: prResp.status }); }
  const prData = await prResp.json();
  return Response.json({ ok: true, pull_request: { number: prData.number, url: prData.html_url, title: prData.title, branch: newBranch, base } });
}
