import { EventEmitter } from "node:events";
import childProcess from "node:child_process";
import readline from "node:readline";

const ALL_THREAD_SOURCE_KINDS = [
  "cli",
  "vscode",
  "exec",
  "appServer",
  "subAgent",
  "subAgentReview",
  "subAgentCompact",
  "subAgentThreadSpawn",
  "subAgentOther",
  "unknown",
];

function comparable(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function threadLabel(thread) {
  return thread.name || thread.preview || thread.id;
}

export class ThreadSelectorError extends Error {
  constructor(message, candidates = []) {
    super(message);
    this.name = "ThreadSelectorError";
    this.candidates = candidates;
  }
}

export function resolveThread(threads, selector) {
  if (selector?.kind === "new") return null;
  const ordered = [...(threads || [])].sort(
    (a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0),
  );
  if (selector?.kind === "recent" || !selector) {
    if (!ordered.length) throw new ThreadSelectorError("No hay hilos disponibles");
    return ordered[0];
  }
  if (selector.kind === "id") {
    const match = ordered.find((thread) => thread.id === selector.value);
    if (!match) throw new ThreadSelectorError(`No existe el hilo con ID ${selector.value}`);
    return match;
  }

  const needle = comparable(selector.value);
  const groups = [
    ordered.filter((thread) => comparable(thread.name) === needle),
    ordered.filter((thread) => comparable(thread.name).startsWith(needle)),
    ordered.filter((thread) => {
      const haystack = `${comparable(thread.name)} ${comparable(thread.preview)}`;
      return haystack.includes(needle);
    }),
  ];
  for (const matches of groups) {
    const unique = [...new Map(matches.map((thread) => [thread.id, thread])).values()];
    if (unique.length === 1) return unique[0];
    if (unique.length > 1) {
      throw new ThreadSelectorError(
        `El selector “${selector.value}” coincide con más de un hilo`,
        unique.slice(0, 8).map((thread) => ({ id: thread.id, name: threadLabel(thread) })),
      );
    }
  }
  throw new ThreadSelectorError(`No encontré un hilo que coincida con “${selector.value}”`);
}

function sandboxPolicy(mode, cwd) {
  if (mode === "workspace-write") {
    return {
      type: "workspaceWrite",
      writableRoots: cwd ? [cwd] : [],
      networkAccess: true,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    };
  }
  return { type: "readOnly", networkAccess: true };
}

export function extractFinalResponse(turn) {
  const messages = (turn?.items || []).filter(
    (item) => item.type === "agentMessage" && item.text?.trim(),
  );
  const final = [...messages].reverse().find((item) => item.phase === "final_answer");
  return (final || messages.at(-1))?.text?.trim() || "";
}

export class CodexAppServerClient extends EventEmitter {
  constructor({
    codexPath = process.env.CODEX_PATH || "codex",
    processFactory = null,
    requestTimeoutMs = 30_000,
  } = {}) {
    super();
    this.codexPath = codexPath;
    this.processFactory = processFactory;
    this.requestTimeoutMs = requestTimeoutMs;
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.completedTurns = new Map();
  }

  async start() {
    if (this.child) return;
    const child = this.processFactory
      ? this.processFactory()
      : childProcess.spawn(this.codexPath, ["app-server", "--stdio"], {
          stdio: ["pipe", "pipe", "pipe"],
          env: process.env,
        });
    this.child = child;
    // A recycled server exits some time after stop(), usually once its
    // replacement is already running. Only the current child may touch shared
    // state; otherwise its late exit drops the new child, which then leaks.
    const isCurrent = () => this.child === child;

    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      if (isCurrent()) this.#handleLine(line);
    });
    child.stderr?.on("data", (chunk) => this.emit("stderr", chunk.toString()));
    child.stdin.on("error", (error) => {
      if (isCurrent()) this.emit("protocolError", error);
    });
    child.on("error", (error) => {
      if (!isCurrent()) return;
      this.#rejectPending(error);
      this.emit("protocolError", error);
    });
    child.on("exit", (code, signal) => {
      if (!isCurrent()) return;
      const error = new Error(`Codex App Server exited (code=${code}, signal=${signal})`);
      this.#rejectPending(error);
      this.child = null;
      this.emit("exit", error);
    });

    await this.request("initialize", {
      clientInfo: {
        name: "secretario-personal-bridge",
        title: "Secretario Personal Bridge",
        version: "0.1.0",
      },
      capabilities: { experimentalApi: false, requestAttestation: false },
    });
    this.notify("initialized");
  }

  stop() {
    const child = this.child;
    if (!child) return;
    this.child = null;
    this.#rejectPending(new Error("Codex App Server stopped"));
    // EOF on stdin also ends the server if it is slow to honor SIGTERM.
    child.stdin?.end();
    child.kill("SIGTERM");
  }

  #rejectPending(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  request(method, params) {
    if (!this.child) return Promise.reject(new Error("Codex App Server is not running"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex App Server request timed out: ${method}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.#write({ id, method, params });
    });
  }

  notify(method, params) {
    this.#write(params === undefined ? { method } : { method, params });
  }

  async listThreads({ limit = 100 } = {}) {
    const result = await this.request("thread/list", {
      limit,
      sortKey: "updated_at",
      sortDirection: "desc",
      sourceKinds: ALL_THREAD_SOURCE_KINDS,
      archived: false,
    });
    return result.data || [];
  }

  async runJob(job, { timeoutMs = 30 * 60 * 1000 } = {}) {
    const threads = await this.listThreads();
    const selected = resolveThread(threads, job.threadSelector);
    const cwd =
      job.cwd || selected?.cwd || process.env.CODEX_BRIDGE_DEFAULT_CWD?.trim() || process.cwd();
    const mode = job.mode || "read-only";
    let thread;

    if (selected) {
      const resumed = await this.request("thread/resume", {
        threadId: selected.id,
        cwd,
        approvalPolicy: "never",
        sandbox: mode,
      });
      thread = resumed.thread;
    } else {
      const started = await this.request("thread/start", {
        cwd,
        approvalPolicy: "never",
        sandbox: mode,
        serviceName: "Secretario Personal Bridge",
        ephemeral: false,
      });
      thread = started.thread;
      const generatedName = `WhatsApp — ${job.prompt.replace(/\s+/g, " ").trim().slice(0, 72)}`;
      await this.request("thread/name/set", { threadId: thread.id, name: generatedName });
      thread.name = generatedName;
    }

    const wrappedPrompt = [
      "[Mensaje de Matías recibido desde su WhatsApp personal mediante el puente del Secretario Personal]",
      job.prompt,
      "",
      "Respondé con una respuesta final autocontenida y breve para devolver por WhatsApp.",
      "No envíes mensajes a terceros, no pagues, no reserves y no autorices acciones externas.",
      "Si hace falta una acción sensible, prepará el texto o paso exacto y pedí confirmación.",
    ].join("\n");

    const startedTurn = await this.request("turn/start", {
      threadId: thread.id,
      clientUserMessageId: job.id,
      input: [{ type: "text", text: wrappedPrompt, text_elements: [] }],
      cwd,
      approvalPolicy: "never",
      sandboxPolicy: sandboxPolicy(mode, cwd),
    });
    const turn = await this.waitForTurn(thread.id, startedTurn.turn.id, timeoutMs);
    if (turn.status !== "completed") {
      throw new Error(turn.error?.message || `El turno terminó con estado ${turn.status}`);
    }
    const response = extractFinalResponse(turn);
    if (!response) throw new Error("Codex completó el turno sin respuesta final");
    return {
      threadId: thread.id,
      threadName: thread.name || selected?.name || thread.preview || null,
      response,
    };
  }

  waitForTurn(threadId, turnId, timeoutMs) {
    const key = `${threadId}:${turnId}`;
    if (this.completedTurns.has(key)) {
      const turn = this.completedTurns.get(key);
      this.completedTurns.delete(key);
      return Promise.resolve(turn);
    }
    return new Promise((resolve, reject) => {
      const onCompleted = (params) => {
        if (params.threadId !== threadId || params.turn.id !== turnId) return;
        clearTimeout(timer);
        this.off("turn/completed", onCompleted);
        this.off("serverError", onServerError);
        resolve(params.turn);
      };
      const onServerError = (params) => {
        if (params?.threadId !== threadId || params?.turnId !== turnId || params?.willRetry) return;
        clearTimeout(timer);
        this.off("turn/completed", onCompleted);
        this.off("serverError", onServerError);
        reject(new Error(params.error?.message || "Codex turn failed"));
      };
      const timer = setTimeout(() => {
        this.off("turn/completed", onCompleted);
        this.off("serverError", onServerError);
        reject(new Error(`Codex turn timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.on("turn/completed", onCompleted);
      this.on("serverError", onServerError);
    });
  }

  #write(message) {
    if (!this.child?.stdin?.writable) {
      throw new Error("Codex App Server input is not writable");
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.emit("protocolError", new Error("Invalid JSON from Codex App Server"));
      return;
    }

    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.id !== undefined && message.method) {
      this.#declineServerRequest(message);
      return;
    }

    if (message.method === "turn/completed") {
      const key = `${message.params.threadId}:${message.params.turn.id}`;
      this.completedTurns.set(key, message.params.turn);
    }
    if (message.method === "error") {
      this.emit("serverError", message.params);
    } else if (message.method) {
      this.emit(message.method, message.params);
    }
  }

  #declineServerRequest(message) {
    const approvalMethods = new Set([
      "item/commandExecution/requestApproval",
      "item/fileChange/requestApproval",
    ]);
    const legacyApprovalMethods = new Set(["applyPatchApproval", "execCommandApproval"]);
    if (approvalMethods.has(message.method)) {
      this.#write({ id: message.id, result: { decision: "decline" } });
    } else if (legacyApprovalMethods.has(message.method)) {
      this.#write({ id: message.id, result: { decision: "denied" } });
    } else if (message.method === "item/tool/requestUserInput") {
      this.#write({ id: message.id, result: { answers: {} } });
    } else if (message.method === "mcpServer/elicitation/request") {
      this.#write({
        id: message.id,
        result: { action: "decline", content: null, _meta: null },
      });
    } else {
      this.#write({
        id: message.id,
        error: { code: -32000, message: "Interactive server request rejected by remote bridge" },
      });
    }
    this.emit("serverRequestDeclined", message);
  }
}
