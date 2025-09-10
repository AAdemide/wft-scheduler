import * as constants from "../utils/constants.js";

export class TokenTimer {
  constructor(stopTime) {
    this.currentTime = 0;
    this.stopTime = stopTime;
    (this.startTimer = () => {
      const intervalId = setInterval(() => {
        this.currentTime++;
      }, 1000);
      if (stopTime < this.currentTime) {
        clearInterval(intervalId);
      }
    }),
      (this.getTokenValid = () => this.stopTime > this.currentTime);
  }
}

const isPreviousDay = (day) => {
  const prevDay = new Date(day).toLocaleDateString("en-GB");
  const now = new Date().toLocaleDateString("en-GB");

  const temp = [
    parseInt(prevDay.split("/").reverse().join("")),
    parseInt(now.split("/").reverse().join("")),
  ];

  return temp[0] < temp[1];
};

export const parseDays = (days, location, timezone) => {
  let events = [];
  for (let day of Object.values(days)) {
    if (isPreviousDay(day.start.slice(0, -1))) {
      continue;
    }

    let event = {
      start: {
        dateTime: day.start.slice(0, -1),
        timeZone: constants.TIMEZONE,
      },
      end: {
        dateTime: day.end.slice(0, -1),
        timeZone: constants.TIMEZONE,
      },
      summary: "",
      description: "",
      location: day.location ?? "",
    };

    for (let segment of day.shifts[Object.keys(day.shifts)[0]].segments) {
      let department = segment.department
        ? segment.department.split("-").pop().split("/")[0].trim()
        : "Lunch";
      let from = new Date(segment.start.slice(0, -1)).toLocaleTimeString(
        "en-US",
        {
          timeStyle: "short",
        }
      );
      let to = new Date(segment.end.slice(0, -1)).toLocaleTimeString("en-US", {
        timeStyle: "short",
      });
      event.summary +=
        department === "Lunch" || department == event.summary
          ? ""
          : `${event.summary.length == 0 ? department : ", " + department}`;
      event.description += `${
        department + (department === "Lunch" ? "" : " Associate")
      } from ${from} to ${to} `;
    }
    event.summary += " Associate";
    events.push(event);
  }
  return events;
};

function toIsoInTimeZone(utcString, timeZone) {
  const date = new Date(utcString);

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const lookup = (type) => parts.find((p) => p.type === type).value;

  const year = lookup("year");
  const month = lookup("month");
  const day = lookup("day");
  const hour = lookup("hour");
  const minute = lookup("minute");
  const second = lookup("second");

  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  s;
}

export function parseDiff(calEvents, fetchedJson, timezone) {
  let events = {
    POST: [],
    DELETE: [],
    PUT: [],
  };
  let calEventsItems = {};
  calEvents.items.forEach((i) => {
    const key = i.start.dateTime.split("T")[0] + "T00:00:00Z";
    const val = {
      start: toIsoInTimeZone(i.start.dateTime, i.start.timezone),
      end: toIsoInTimeZone(i.end.dateTime, i.end.timezone),
      eventId: i.id,
    };

    calEventsItems[key] = val;
  });

  const { days } = fetchedJson;
  for (const day in days) {
    const newDay = days[day];
    days[day] = parseDays({ [day]: newDay })[0];
  }

  const allKeys = new Set(
    [...Object.keys(days), ...Object.keys(calEventsItems)].filter((k) => {
      return !isPreviousDay(k.slice(0, -1));
    })
  );

  allKeys.forEach((d) => {
    const updated = days[d];
    const current = calEventsItems[d];
    if (updated && !current) {
      events["POST"].push(updated);
    } else if (
      !updated &&
      current
      || events["DELETE"].length == 0
    ) {
      events["DELETE"].push(current.eventId);
    } else if (
      updated.start.dateTime + "Z" !== current.start ||
      updated.end.dateTime + "Z" !== current.end
      || events["PUT"].length == 0
    ) {
      events["PUT"].push({
        payload: { ...updated, location: current.location },
        eventId: current.eventId,
      });
    }
  });
  return events;
}
