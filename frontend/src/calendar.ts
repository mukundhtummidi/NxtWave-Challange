// Add-to-calendar helpers. Parses the workshop start from config's start_iso (IST ISO string),
// builds a downloadable .ics and a Google Calendar template URL. No emails, no server round-trip.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import type { Workshop } from "@/src/api";

export type CalEvent = { title: string; start: Date; end: Date; description: string; location: string };

export function workshopEvent(workshop: Workshop, link: string): CalEvent {
  const start = new Date(workshop.start_iso);
  const minutes = workshop.duration_minutes || 60;
  const end = new Date(start.getTime() + minutes * 60_000);
  const description = `${workshop.title}\n${workshop.datetime_label}\n\nJoin / details: ${link}`;
  return { title: workshop.title, start, end, description, location: workshop.mode || "Online" };
}

/** Days until the workshop. Returns a label; "started" once the start time has passed. */
export function countdownLabel(startIso: string, now: Date = new Date()): { started: boolean; days: number; label: string } {
  const start = new Date(startIso);
  const ms = start.getTime() - now.getTime();
  if (Number.isNaN(start.getTime()) || ms <= 0) return { started: true, days: 0, label: "This session has started" };
  const days = Math.ceil(ms / 86_400_000);
  const label = days === 1 ? "Starts tomorrow" : `Starts in ${days} days`;
  return { started: false, days, label };
}

function toUtcBasic(d: Date): string {
  // YYYYMMDDTHHMMSSZ
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function buildIcs(ev: CalEvent): string {
  const uid = `${toUtcBasic(ev.start)}-${Math.random().toString(36).slice(2, 8)}@yourhallticket`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Your Hall Ticket//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toUtcBasic(new Date())}`,
    `DTSTART:${toUtcBasic(ev.start)}`,
    `DTEND:${toUtcBasic(ev.end)}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    `DESCRIPTION:${icsEscape(ev.description)}`,
    `LOCATION:${icsEscape(ev.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

export function googleCalendarUrl(ev: CalEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${toUtcBasic(ev.start)}/${toUtcBasic(ev.end)}`,
    details: ev.description,
    location: ev.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Download/open the .ics. Web: browser download. Native: write to cache + share sheet. */
export async function downloadIcs(ev: CalEvent): Promise<"downloaded" | "shared" | "opened"> {
  const ics = buildIcs(ev);
  if (Platform.OS === "web") {
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = "your-hall-ticket.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
    return "downloaded";
  }
  const target = `${FileSystem.cacheDirectory}your-hall-ticket.ics`;
  await FileSystem.writeAsStringAsync(target, ics, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target, { mimeType: "text/calendar", dialogTitle: "Add to calendar" });
    return "shared";
  }
  return "opened";
}
