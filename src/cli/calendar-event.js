#!/usr/bin/env node
import { boolFromEnv, envValue, intFromEnv } from "../personal/env.js";
import { googleApiGet, googleApiJson } from "../personal/google.js";

const DEFAULT_TZ = envValue("DEFAULT_TIMEZONE", "America/Argentina/Buenos_Aires");

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return fallback;
}

function argValues(name) {
  const values = [];
  const prefix = `--${name}=`;
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith(prefix)) values.push(arg.slice(prefix.length));
    if (arg === `--${name}` && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
      values.push(process.argv[i + 1]);
      i += 1;
    }
  }
  return values;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function intArg(name, fallback, { min = 1, max = 50 } = {}) {
  const parsed = Number.parseInt(argValue(name, String(fallback)), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function command() {
  const cmd = process.argv.find((arg, idx) => idx > 1 && !arg.startsWith("--"));
  return cmd || "help";
}

function usage() {
  return `Uso:
  node src/cli/calendar-event.js list [--calendar-id primary] [--time-min ISO] [--time-max ISO] [--query texto] [--max-results 10]
  node src/cli/calendar-event.js create --confirm --summary "..." --start ISO --end ISO [--calendar-id primary] [--description "..."] [--location "..."] [--attendee email]
  node src/cli/calendar-event.js update --confirm --event-id ID [--calendar-id primary] [--summary "..."] [--start ISO --end ISO] [--description "..."] [--location "..."] [--attendee email]
  node src/cli/calendar-event.js delete --confirm --event-id ID [--calendar-id primary]

Seguridad:
  - create/update/delete requieren CALENDAR_WRITE_ENABLED=true y --confirm.
  - Pedí confirmación explícita de Matías antes de cualquier mutación.
  - Usá fechas ISO con zona horaria, ej: 2026-06-25T15:00:00-03:00.
`;
}

function requireCalendarWrite(action) {
  if (!boolFromEnv("CALENDAR_WRITE_ENABLED", false)) {
    throw new Error(`${action} bloqueado: seteá CALENDAR_WRITE_ENABLED=true para permitir mutaciones de Calendar.`);
  }
  if (!hasFlag("confirm")) {
    throw new Error(`${action} bloqueado: falta --confirm. Confirmá explícitamente con Matías antes de mutar Calendar.`);
  }
}

function requireValue(name) {
  const value = argValue(name);
  if (!value) throw new Error(`Falta --${name}`);
  return value;
}

function calendarId() {
  return argValue("calendar-id", "primary");
}

function dateTime(iso) {
  if (!iso) return undefined;
  if (!Number.isFinite(Date.parse(iso))) {
    throw new Error(`Fecha inválida: ${iso}. Usá ISO con zona horaria.`);
  }
  return { dateTime: iso, timeZone: DEFAULT_TZ };
}

function eventPatchFromArgs({ requireTimes = false } = {}) {
  const body = {};
  const summary = argValue("summary");
  const description = argValue("description");
  const location = argValue("location");
  const start = argValue("start");
  const end = argValue("end");
  const attendees = argValues("attendee");

  if (summary) body.summary = summary;
  if (description) body.description = description;
  if (location) body.location = location;
  if (start || end || requireTimes) {
    if (!start || !end) throw new Error("--start y --end deben venir juntos.");
    body.start = dateTime(start);
    body.end = dateTime(end);
  }
  if (attendees.length) body.attendees = attendees.map((email) => ({ email }));
  return body;
}

function summarizeEvent(event) {
  return {
    id: event.id,
    status: event.status,
    summary: event.summary || "(sin título)",
    start: event.start?.dateTime || event.start?.date || null,
    end: event.end?.dateTime || event.end?.date || null,
    htmlLink: event.htmlLink || null,
  };
}

async function listEvents() {
  const now = new Date();
  const defaultMax = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const data = await googleApiGet(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}/events`,
    {
      timeMin: argValue("time-min", now.toISOString()),
      timeMax: argValue("time-max", defaultMax),
      q: argValue("query"),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: intFromEnv("CALENDAR_CLI_MAX_RESULTS", intArg("max-results", 10, { min: 1, max: 50 }), { min: 1, max: 50 }),
    },
    { service: "calendar" },
  );
  return { ok: true, action: "list", events: (data.items || []).map(summarizeEvent) };
}

async function createEvent() {
  requireCalendarWrite("create");
  requireValue("summary");
  const body = eventPatchFromArgs({ requireTimes: true });
  const data = await googleApiJson(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}/events`,
    { service: "calendar", method: "POST", body, params: { sendUpdates: argValue("send-updates", "none") } },
  );
  return { ok: true, action: "create", event: summarizeEvent(data) };
}

async function updateEvent() {
  requireCalendarWrite("update");
  const eventId = requireValue("event-id");
  const body = eventPatchFromArgs();
  if (!Object.keys(body).length) throw new Error("No hay campos para actualizar.");
  const data = await googleApiJson(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}/events/${encodeURIComponent(eventId)}`,
    { service: "calendar", method: "PATCH", body, params: { sendUpdates: argValue("send-updates", "none") } },
  );
  return { ok: true, action: "update", event: summarizeEvent(data) };
}

async function deleteEvent() {
  requireCalendarWrite("delete");
  const eventId = requireValue("event-id");
  await googleApiJson(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}/events/${encodeURIComponent(eventId)}`,
    {
      service: "calendar",
      method: "DELETE",
      params: { sendUpdates: argValue("send-updates", "none") },
      expectedStatuses: [200, 204],
    },
  );
  return { ok: true, action: "delete", eventId, calendarId: calendarId() };
}

async function main() {
  switch (command()) {
    case "list":
      return listEvents();
    case "create":
      return createEvent();
    case "update":
      return updateEvent();
    case "delete":
      return deleteEvent();
    case "help":
    case "--help":
    case "-h":
      console.log(usage());
      return null;
    default:
      throw new Error(`Comando desconocido.\n${usage()}`);
  }
}

main()
  .then((result) => {
    if (result) console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error(err.message || String(err));
    process.exit(1);
  });
