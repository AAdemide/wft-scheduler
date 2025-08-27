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
      (this.tokenValid = () => this.stopTime > this.currentTime);
  }
}

const isPreviousDay = (day) => {
  const prevDay = new Date(day).toLocaleDateString("en-GB");
  const now = new Date().toLocaleDateString("en-GB");

  const temp = [parseInt(prevDay.split("/").reverse().join("")), parseInt(now.split("/").reverse().join(""))]

  return  temp[0] < temp[1]

}

export const parseDays = (days) => {

  let events = [];
  for (let day of Object.values(days)) {
    if (isPreviousDay(day.start.slice(0, -1))) {
      continue;
    }

    // console.log("day: ", day)
    // const day = days[d];
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
    };

    for (let segment of day.shifts[Object.keys(day.shifts)[0]].segments) {
      let department = segment.department
        ? segment.department.split("-").pop().split("/")[0].trim()
        : "Lunch";
      let from = new Date(segment.start.slice(0, -1)).toLocaleTimeString("en-US", {
        timeStyle: "short",
      });
      let to = new Date(segment.end.slice(0, -1)).toLocaleTimeString("en-US", {
        timeStyle: "short",
      });
      event.summary += ( ((department==="Lunch") ||(department==event.summary)) ? "" : `${
        event.summary.length == 0 ? department : ", " + department
      }`);
      event.description += `${department + (department=== "Lunch" ? "" : " Associate")} from ${from} to ${to} `;
    }
    event.summary += " Associate";
    events.push(event);
  }
  return events;
};
