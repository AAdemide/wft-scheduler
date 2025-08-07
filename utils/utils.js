import * as constants from "../utils/constants.js";

// parseDays returns {
//   start: { dateTime: "2025-02-09T14:30:00", timeZone: "America/Toronto" },
//   end: { dateTime: "2025-02-09T20:00:00", timeZone: "America/Toronto" },
//   summary: "Lunch, Lunch, Lunch Associate",
//   description:
//     "Lunch Associate from Invalid Date to Invalid DateLunch Associate from Invalid Date to Invalid DateLunch Associate from Invalid Date to Invalid Date",
//   location: "Rexdale",
// };

// single day object passed to parseDays
// 2025-02-09T00:00:00Z: {
//   "start": "2025-02-09T14:30:00Z",
//   "end": "2025-02-09T20:00:00Z",
//   "duration": 330,
//   "payableDuration": 300,
//   "shifts": {
//       "1283533073": {
//           "shiftId": "1283533073",
//           "start": "2025-02-09T14:30:00Z",
//           "end": "2025-02-09T20:00:00Z",
//           "duration": 330,
//           "payableDuration": 300,
//           "segments": [
//               {
//                   "shiftId": "1174128094",
//                   "start": "2025-02-09T14:30:00Z",
//                   "end": "2025-02-09T18:00:00Z",
//                   "duration": 210,
//                   "payableDuration": 210,
//                   "department": "Home Depot/CAN/Magasin-Stores/Canada/Est-East/District 0350/7114 - Store/030 - Millwork/Associate",
//                   "details": "REGULAR_SEGMENT",
//                   "type": "regular",
//                   "published": true,
//                   "location": "Home Depot/CAN/Magasin-Stores/Canada/Est-East/District 0350/7114 - Store/030 - Millwork/Associate",
//                   "payable": true
//               },
//               {
//                   "shiftId": "1174128095",
//                   "start": "2025-02-09T18:00:00Z",
//                   "end": "2025-02-09T18:30:00Z",
//                   "duration": 30,
//                   "payableDuration": 0,
//                   "details": "BREAK_SEGMENT",
//                   "type": "break",
//                   "published": true,
//                   "location": "",
//                   "payable": false
//               },
//               {
//                   "shiftId": "1174128096",
//                   "start": "2025-02-09T18:30:00Z",
//                   "end": "2025-02-09T20:00:00Z",
//                   "duration": 90,
//                   "payableDuration": 90,
//                   "department": "Home Depot/CAN/Magasin-Stores/Canada/Est-East/District 0350/7114 - Store/030 - Millwork/Associate",
//                   "details": "REGULAR_SEGMENT",
//                   "type": "regular",
//                   "published": true,
//                   "location": "Home Depot/CAN/Magasin-Stores/Canada/Est-East/District 0350/7114 - Store/030 - Millwork/Associate",
//                   "payable": true
//               }
//           ],
//           "published": true
//       }
//   }
// }

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
      event.summary +=( ((department==="Lunch") ||(department==event.summary)) ? "" : `${
        event.summary.length == 0 ? department : ", " + department
      }`);
      event.description += `${department + (department=== "Lunch" ? "" : " Associate")} from ${from} to ${to} `;
    }
    event.summary += " Associate";
    events.push(event);
  }
  return events;
};
