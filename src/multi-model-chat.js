/**
 * Multi-Model Chat — แชทที่ใช้ AI หลายโมเดลในห้องเดียว
 * รองรับ: OpenAI, Anthropic (Claude), Gemini
 */

const PROVIDERS = {
  openai: { label: "OpenAI", envKey: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL", defaultModel: "gpt-4.1" },
  anthropic: { label: "Anthropic", envKey: "ANTHROPIC_API_KEY", modelEnv: "ANTHROPIC_MODEL", defaultModel: "claude-sonnet-4-20250514" },
  gemini: { label: "Gemini", envKey: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL", defaultModel: "gemini-2.5-flash" },
};

function resolveModels(env, requested) {
  const available = [];
  for (const [id, cfg] of Object.entries(PROVIDERS)) {
    if (env[cfg.envKey]) available.push({ id, label: cfg.label, model: (env[cfg.modelEnv] || cfg.defaultModel).trim(), apiKey: env[cfg.envKey] });
  }
  if (!requested || requested === "all" || requested === "auto") return available;
  const ids = requested.split(",").map((s) => s.trim().toLowerCase());
  return available.filter((m) => ids.includes(m.id));
}

async function callOpenAI(model, apiKey, messages, stream) {
  const body = { model, input: messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })) };
  if (stream) body.stream = true;
  return await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function callAnthropic(model, apiKey, messages, stream) {
  let system = "";
  const chatMessages = [];
  for (const m of messages) { if (m.role === "system") system += m.content + "\n"; else chatMessages.push({ role: m.role, content: m.content }); }
  const body = { model, max_tokens: 4096, messages: chatMessages };
  if (system.trim()) body.system = system.trim();
  if (stream) body.stream = true;
  return await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function callGemini(model, apiKey, messages, stream) {
  let systemInstruction = "";
  const contents = [];
  for (const m of messages) { if (m.role === "system") systemInstruction += m.content + "\n"; else contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }); }
  const body = { contents, generationConfig: { maxOutputTokens: 4096 } };
  if (systemInstruction.trim()) body.systemInstruction = { parts: [{ text: systemInstruction.trim() }] };
  const endpoint = stream ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse` : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function extractText(providerId, resp) {
  if (!resp.ok) { const err = await resp.text().catch(() => ""); return { error: true, status: resp.status, text: err.slice(0, 500) }; }
  const data = await resp.json();
  if (providerId === "openai") { const text = data.output?.filter((o) => o.type === "message").map((o) => o.content?.map((c) => c.text).join("")).join(""); return { error: false, text: text || "" }; }
  if (providerId === "anthropic") { const text = data.content?.map((c) => c.text).join(""); return { error: false, text: text || "" }; }
  if (providerId === "gemini") { const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join(""); return { error: false, text: text || "" }; }
  return { error: false, text: "" };
}

export function handleProviderList(env) {
  const providers = [];
  for (const [id, cfg] of Object.entries(PROVIDERS)) { if (env[cfg.envKey]) providers.push({ id, label: cfg.label }); }
  return Response.json({ ok: true, providers, total: providers.length });
}

export async function handleMultiModelChat(request, env) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "ใช้ POST เท่านั้น" }, { status: 405 });
  let body = {}; try { body = await request.json(); } catch (_) {}
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser || !lastUser.content?.trim()) return Response.json({ ok: false, message: "กรุณาส่งข้อความ" }, { status: 400 });
  const models = resolveModels(env, body.models);
  if (models.length === 0) return Response.json({ ok: false, message: "ไม่มี AI provider ที่พร้อมใช้งาน" }, { status: 503 });
  const results = await Promise.allSettled(models.map(async (m) => {
    let resp;
    if (m.id === "openai") resp = await callOpenAI(m.model, m.apiKey, messages, false);
    else if (m.id === "anthropic") resp = await callAnthropic(m.model, m.apiKey, messages, false);
    else if (m.id === "gemini") resp = await callGemini(m.model, m.apiKey, messages, false);
    const result = await extractText(m.id, resp);
    return { model: m.id, label: m.label, model_name: m.model, ...result };
  }));
  const responses = results.map((r) => r.status === "fulfilled" ? r.value : { model: "unknown", label: "Unknown", error: true, text: r.reason?.message || "เกิดข้อผิดพลาด" });
  return Response.json({ ok: true, responses });
}

export async function handleMultiModelChatStream(request, env) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "ใช้ POST เท่านั้น" }, { status: 405 });
  let body = {}; try { body = await request.json(); } catch (_) {}
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser || !lastUser.content?.trim()) return Response.json({ ok: false, message: "กรุณาส่งข้อความ" }, { status: 400 });
  const models = resolveModels(env, body.models);
  if (models.length === 0) return Response.json({ ok: false, message: "ไม่มี AI provider ที่พร้อมใช้งาน" }, { status: 503 });
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const emit = async (obj) => { await writer.write(encoder.encode(JSON.stringify(obj) + "\n")); };
  (async () => {
    await emit({ type: "models", models: models.map((m) => ({ id: m.id, label: m.label, model: m.model })) });
    const tasks = models.map(async (m) => {
      try {
        let resp;
        if (m.id === "openai") resp = await callOpenAI(m.model, m.apiKey, messages, true);
        else if (m.id === "anthropic") resp = await callAnthropic(m.model, m.apiKey, messages, true);
        else if (m.id === "gemini") resp = await callGemini(m.model, m.apiKey, messages, true);
        if (!resp.ok) { const errText = await resp.text().catch(() => ""); await emit({ type: "error", model: m.id, label: m.label, message: errText.slice(0, 300) }); return; }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          if (m.id === "openai") {
            let cut;
            while ((cut = buffer.indexOf("\n")) !== -1) { const line = buffer.slice(0, cut).trim(); buffer = buffer.slice(cut + 1); if (!line.startsWith("data:")) continue; try { const event = JSON.parse(line.slice(5).trim()); if (event.type === "response.output_text.delta" && event.delta) await emit({ type: "delta", model: m.id, label: m.label, text: event.delta }); else if (event.type === "response.completed") await emit({ type: "done", model: m.id, label: m.label }); } catch (_) {} }
          } else if (m.id === "anthropic") {
            let cut;
            while ((cut = buffer.indexOf("\n\n")) !== -1) { const block = buffer.slice(0, cut); buffer = buffer.slice(cut + 2); const dataLine = block.split("\n").find((l) => l.startsWith("data:")); if (!dataLine) continue; try { const event = JSON.parse(dataLine.slice(5).trim()); if (event.type === "content_block_delta" && event.delta?.text) await emit({ type: "delta", model: m.id, label: m.label, text: event.delta.text }); else if (event.type === "message_stop") await emit({ type: "done", model: m.id, label: m.label }); } catch (_) {} }
          } else if (m.id === "gemini") {
            let cut;
            while ((cut = buffer.indexOf("\n")) !== -1) { const line = buffer.slice(0, cut).trim(); buffer = buffer.slice(cut + 1); if (!line.startsWith("data:")) continue; try { const event = JSON.parse(line.slice(5).trim()); const text = event.candidates?.[0]?.content?.parts?.map((p) => p.text).join(""); if (text) await emit({ type: "delta", model: m.id, label: m.label, text }); } catch (_) {} }
          }
        }
        await emit({ type: "done", model: m.id, label: m.label });
      } catch (err) { await emit({ type: "error", model: m.id, label: m.label, message: err.message || "เกิดข้อผิดพลาด" }); }
    });
    await Promise.allSettled(tasks);
    await emit({ type: "all_done" });
    await writer.close().catch(() => {});
  })();
  return new Response(readable, { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
