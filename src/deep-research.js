/**
 * Deep Research — โหมดค้นคว้าระดมสมอง พร้อมแหล่งอ้างอิง
 */

async function generateSearchQueries(env, question) {
  const model = (env.OPENAI_MODEL || "gpt-4.1").trim();
  const prompt = `คุณเป็นผู้ช่วยวิจัย จงสร้างคำค้นหา 3-5 คำ เพื่อค้นหาข้อมูลเกี่ยวกับคำถามต่อไปนี้ ตอบเฉพาะคำค้นหา บรรทัดละคำ:\n\nคำถาม: ${question}`;
  const resp = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: [{ role: "user", content: prompt }] }) });
  if (!resp.ok) return [question];
  const data = await resp.json();
  const text = data.output?.filter((o) => o.type === "message").map((o) => o.content?.map((c) => c.text).join("")).join("") || "";
  const queries = text.split("\n").map((l) => l.replace(/^\d+\.\s*/, "").trim()).filter((l) => l.length > 2 && l.length < 200).slice(0, 5);
  return queries.length > 0 ? queries : [question];
}

async function exaSearch(env, query, numResults = 5) {
  if (!env.EXA_API_KEY) return [];
  try {
    const resp = await fetch("https://api.exa.ai/search", { method: "POST", headers: { "x-api-key": env.EXA_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ query, numResults, useAutoprompt: true, contents: { text: { maxCharacters: 2000 } } }) });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.results || []).map((r) => ({ title: r.title || "", url: r.url || "", text: r.text || "", publishedDate: r.publishedDate || "" }));
  } catch (_) { return []; }
}

async function fetchPageContent(url) {
  try {
    const resp = await fetch(url, { cf: { cacheTtl: 300, cacheEverything: true }, headers: { "User-Agent": "lsuperagent-research/1.0" } });
    if (!resp.ok) return null;
    const html = await resp.text();
    return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
  } catch (_) { return null; }
}

async function synthesizeAnswer(env, question, sources) {
  const model = (env.OPENAI_MODEL || "gpt-4.1").trim();
  const context = sources.slice(0, 8).map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\nเนื้อหา: ${(s.text || "").slice(0, 1500)}`).join("\n\n---\n\n");
  const prompt = `คุณเป็นผู้ช่วยวิจัย จงวิเคราะห์และสรุปข้อมูลจากแหล่งอ้างอิงเพื่อตอบคำถาม\n\n## คำถาม\n${question}\n\n## แหล่งอ้างอิง\n${context}\n\n## คำสั่ง\n1. สรุปข้อเท็จจริงที่สำคัญ\n2. อ้างอิงแหล่งโดยใส่เลข เช่น [1], [2]\n3. ถ้าข้อมูลไม่เพียงพอ ให้ระบุ\n4. เขียนเป็นภาษาไทย กระชับ ชัดเจน\n\n## คำตอบ`;
  const resp = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: [{ role: "user", content: prompt }] }) });
  if (!resp.ok) return { summary: "ไม่สามารถสรุปข้อมูลได้" };
  const data = await resp.json();
  return { summary: data.output?.filter((o) => o.type === "message").map((o) => o.content?.map((c) => c.text).join("")).join("") || "ไม่มีผลลัพธ์" };
}

export async function handleDeepResearch(request, env) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "ใช้ POST เท่านั้น" }, { status: 405 });
  let body = {}; try { body = await request.json(); } catch (_) {}
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ ok: false, message: "กรุณาระบุคำถาม" }, { status: 400 });
  if (question.length > 5000) return Response.json({ ok: false, message: "คำถามยาวเกินไป" }, { status: 413 });
  if (!env.OPENAI_API_KEY) return Response.json({ ok: false, message: "ยังไม่ได้ตั้งค่า OpenAI API Key" }, { status: 503 });
  const queries = await generateSearchQueries(env, question);
  const searchResults = await Promise.allSettled(queries.map((q) => exaSearch(env, q, 5)));
  const seenUrls = new Set();
  let allSources = [];
  for (const r of searchResults) { if (r.status !== "fulfilled") continue; for (const s of r.value) { if (s.url && !seenUrls.has(s.url)) { seenUrls.add(s.url); allSources.push(s); } } }
  if (allSources.length === 0 && !env.EXA_API_KEY) {
    try {
      const ddgResp = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(question)}`, { cf: { cacheTtl: 300 }, headers: { "User-Agent": "lsuperagent-research/1.0" } });
      if (ddgResp.ok) {
        const html = await ddgResp.text();
        const links = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
        for (const [, href, title] of links.slice(0, 5)) {
          const cleanTitle = title.replace(/<[^>]+>/g, "").trim();
          const cleanUrl = href.replace(/&rut=.*$/, "");
          if (cleanUrl && cleanTitle) { const content = await fetchPageContent(cleanUrl); allSources.push({ title: cleanTitle, url: cleanUrl, text: content || "" }); }
        }
      }
    } catch (_) {}
  }
  if (allSources.length === 0) return Response.json({ ok: false, message: "ไม่พบข้อมูล ลองเปลี่ยนคำถามหรือตั้งค่า EXA_API_KEY", queries }, { status: 404 });
  const { summary } = await synthesizeAnswer(env, question, allSources);
  return Response.json({ ok: true, question, queries, summary, sources: allSources.slice(0, 10).map((s, i) => ({ index: i + 1, title: s.title, url: s.url, snippet: (s.text || "").slice(0, 300), published: s.publishedDate || null })), total_sources: allSources.length });
}

export async function handleDeepResearchStream(request, env) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "ใช้ POST เท่านั้น" }, { status: 405 });
  let body = {}; try { body = await request.json(); } catch (_) {}
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ ok: false, message: "กรุณาระบุคำถาม" }, { status: 400 });
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const emit = async (obj) => { await writer.write(encoder.encode(JSON.stringify(obj) + "\n")); };
  (async () => {
    try {
      await emit({ type: "status", stage: "generating_queries", message: "กำลังสร้างคำค้นหา..." });
      const queries = await generateSearchQueries(env, question);
      await emit({ type: "queries", queries });
      await emit({ type: "status", stage: "searching", message: "กำลังค้นหาข้อมูล..." });
      const searchResults = await Promise.allSettled(queries.map((q) => exaSearch(env, q, 5)));
      const seenUrls = new Set();
      let allSources = [];
      for (const r of searchResults) { if (r.status !== "fulfilled") continue; for (const s of r.value) { if (s.url && !seenUrls.has(s.url)) { seenUrls.add(s.url); allSources.push(s); } } }
      await emit({ type: "sources", sources: allSources.slice(0, 10).map((s, i) => ({ index: i + 1, title: s.title, url: s.url, snippet: (s.text || "").slice(0, 300) })) });
      if (allSources.length === 0) { await emit({ type: "error", message: "ไม่พบข้อมูลจากการค้นหา" }); await writer.close(); return; }
      await emit({ type: "status", stage: "synthesizing", message: "กำลังสรุปข้อมูล..." });
      const model = (env.OPENAI_MODEL || "gpt-4.1").trim();
      const context = allSources.slice(0, 8).map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\nเนื้อหา: ${(s.text || "").slice(0, 1500)}`).join("\n\n---\n\n");
      const prompt = `คุณเป็นผู้ช่วยวิจัย จงวิเคราะห์และสรุปข้อมูลจากแหล่งอ้างอิงเพื่อตอบคำถาม\n\n## คำถาม\n${question}\n\n## แหล่งอ้างอิง\n${context}\n\n## คำสั่ง\n1. สรุปข้อเท็จจริงที่สำคัญ\n2. อ้างอิงแหล่งโดยใส่เลข เช่น [1], [2]\n3. ถ้าข้อมูลไม่เพียงพอ ให้ระบุ\n4. เขียนเป็นภาษาไทย กระชับ ชัดเจน\n\n## คำตอบ`;
      const resp = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: [{ role: "user", content: prompt }], stream: true }) });
      if (!resp.ok) { await emit({ type: "error", message: "ไม่สามารถสรุปข้อมูลได้" }); await writer.close(); return; }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf("\n")) !== -1) { const line = buffer.slice(0, cut).trim(); buffer = buffer.slice(cut + 1); if (!line.startsWith("data:")) continue; try { const event = JSON.parse(line.slice(5).trim()); if (event.type === "response.output_text.delta" && event.delta) await emit({ type: "delta", text: event.delta }); } catch (_) {} }
      }
      await emit({ type: "done", total_sources: allSources.length });
    } catch (err) { await emit({ type: "error", message: err.message || "เกิดข้อผิดพลาด" }); }
    await writer.close().catch(() => {});
  })();
  return new Response(readable, { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
