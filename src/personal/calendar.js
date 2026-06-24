import { boolFromEnv, listFromEnv, intFromEnv } from "./env.js";
import { googleApiGet, googleCredentialsStatus } from "./google.js";
import { safeErrorMessage } from "./http.js";

function eventStart(event) {
  return event.start?.dateTime || event.start?.date || "";
}

function eventEnd(event) {
  return event.end?.dateTime || event.end?.date || "";
}

function isAllDay(event) {
  return Boolean(event.start?.date && !event.start?.dateTime);
}

function normalizeEvent(event, calendarId) {
  const start = eventStart(event);
  const end = eventEnd(event);
  return {
    id: event.id,
    calendarId,
    status: event.status || "confirmed",
    summary: event.summary || "(sin título)",
    description: event.description ? String(event.description).slice(0, 240) : "",
    location: event.location || "",
    start,
    end,
    allDay: isAllDay(event),
    updated: event.updated,
    htmlLink: event.htmlLink,
    attendees: Array.isArray(event.attendees)
      ? event.attendees.slice(0, 10).map((a) => ({ email: a.email, responseStatus: a.responseStatus }))
      : [],
  };
}

function minutesUntil(iso) {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return Math.round((ts - Date.now()) / 60_000);
}

function overlaps(a, b) {
  if (a.allDay || b.allDay || a.status === "cancelled" || b.status === "cancelled") return false;
  const aStart = Date.parse(a.start);
  const aEnd = Date.parse(a.end);
  const bStart = Date.parse(b.start);
  const bEnd = Date.parse(b.end);
  if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) return false;
  return aStart < bEnd && bStart < aEnd;
}

function buildCalendarSignals(events, window) {
  const signals = [];
  const now = Date.now();
  const upcomingSoonMinutes = intFromEnv("CALENDAR_UPCOMING_SOON_MINUTES", 120, {
    min: 5,
    max: 1440,
  });
  const sinceMs = Date.parse(window.since);

  for (const event of events) {
    if (event.status === "cancelled") {
      const updatedMs = Date.parse(event.updated);
      if (!Number.isFinite(sinceMs) || !Number.isFinite(updatedMs) || updatedMs >= sinceMs) {
        signals.push({
          source: "Calendar",
          priority: "P1",
          title: `Evento cancelado: ${event.summary}`,
          summary: event.calendarId,
          when: event.updated || event.start,
          url: event.htmlLink,
          action: "Ver si cambia planes o requiere aviso a alguien",
        });
      }
      continue;
    }

    const minutes = minutesUntil(event.start);
    if (minutes !== null && minutes >= 0 && minutes <= upcomingSoonMinutes) {
      signals.push({
        source: "Calendar",
        priority: "P1",
        title: `Próximo evento: ${event.summary}`,
        summary: event.location || event.calendarId,
        when: event.start,
        url: event.htmlLink,
        action: "Prepararse o confirmar traslado/materiales",
      });
      continue;
    }

    const startMs = Date.parse(event.start);
    if (Number.isFinite(startMs) && startMs >= now && startMs <= Date.parse(window.calendarUntil)) {
      signals.push({
        source: "Calendar",
        priority: "P2",
        title: event.summary,
        summary: event.location || event.calendarId,
        when: event.start,
        url: event.htmlLink,
        action: "Tener en radar",
      });
    }
  }

  const confirmed = events
    .filter((event) => event.status !== "cancelled")
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  for (let i = 0; i < confirmed.length; i++) {
    for (let j = i + 1; j < confirmed.length; j++) {
      if (overlaps(confirmed[i], confirmed[j])) {
        signals.push({
          source: "Calendar",
          priority: "P1",
          title: `Conflicto de agenda: ${confirmed[i].summary} / ${confirmed[j].summary}`,
          summary: `${confirmed[i].calendarId} + ${confirmed[j].calendarId}`,
          when: confirmed[j].start,
          url: confirmed[j].htmlLink || confirmed[i].htmlLink,
          action: "Resolver conflicto antes del evento",
        });
      }
    }
  }

  return signals;
}

export async function collectCalendar({ window }) {
  const source = {
    name: "calendar",
    enabled: boolFromEnv("GOOGLE_CALENDAR_ENABLED", true),
    configured: googleCredentialsStatus("calendar").configured,
    status: "disabled",
    items: [],
    signals: [],
    warnings: [],
  };

  if (!source.enabled) return source;
  if (!source.configured) {
    source.status = "missing_credentials";
    source.warnings.push(
      "Faltan credenciales Google OAuth para Calendar (mismas variables que Gmail).",
    );
    return source;
  }

  const calendarIds = listFromEnv("GOOGLE_CALENDAR_IDS", ["primary"]);
  const maxResults = intFromEnv("GOOGLE_CALENDAR_MAX_RESULTS", 30, { min: 1, max: 100 });

  try {
    const events = [];
    for (const calendarId of calendarIds) {
      const data = await googleApiGet(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          timeMin: window.since,
          timeMax: window.calendarUntil,
          singleEvents: true,
          orderBy: "startTime",
          showDeleted: true,
          maxResults,
        },
        { service: "calendar" },
      );
      events.push(...(data?.items || []).map((event) => normalizeEvent(event, calendarId)));
    }

    source.items = events.sort((a, b) => Date.parse(a.start || a.updated) - Date.parse(b.start || b.updated));
    source.signals = buildCalendarSignals(source.items, window);
    source.status = "ok";
    return source;
  } catch (err) {
    source.status = "error";
    source.warnings.push(`Calendar API falló: ${safeErrorMessage(err)}`);
    return source;
  }
}
