import { AUTH_STATES, API_STATES, defaultReminder } from "./constants";

export default class GApiUtils {
  constructor(calId) {
    this.calId = calId;
    this.globalInit = {
      async: true,
      ["Content-Type"]: "application/json",
    };
    this.authState = AUTH_STATES.UNAUTHENTICATED;
    this.apiState = API_STATES.IDLE;
  }

  static async create() {
    const calId = await makeCalendar();
    return new gApiUtils(calId);
  }

  async makeCalendar(body) {
    let init = {
      ...this.globalInit,
      method: "POST",
      body: JSON.stringify(body),
    };
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars",
      init
    );
    const data = await res.json();
    if (data.error) {
      throw new Error(JSON.stringify(data.error));
    }
    const calendarID = JSON.parse(JSON.stringify(data)).id;
    this.calId = calendarID;
    return calendarID;
  }

  //adds calendar to users calendar list
  async addToCalendarList(options) {
    let init = { ...this.globalInit };
    init.method = "POST";
    init.body = JSON.stringify(options);

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?colorRgbFormat=true",
      init
    );
    const data = await res.json();
    if (data.error) {
      throw new Error(JSON.stringify(data.error));
    }
  }

  //separate into 2 functions
  async addEventsToCalendar(events) {
    let init = { ...this.globalInit };
    init.method = "POST";
    return Promise.all(
      events.map((event) => {
        const body = JSON.stringify(event);
        return fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${this.calId}/events`,
          {
            ...init,
            body,
          }
        );
      })
    )
      .then((res) =>
        res.map((i) => {
          const r = i.json();
          return r;
        })
      )

      .then((data) => {
        console.log("success");
        console.log(data);
        return true;
      })
      .catch((err) => {
        console.warn(err);
        return false;
      });
  }

  async deleteCalendar() {
    const init = { ...this.globalInit, method: "DELETE" };
    return fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${this.calId}`,
      init
    )
      .then((res) => {
        if (res.ok) {
          return text();
        }
        throw new Error(res.status);
      })
      .then((data) => {
        console.log(data);
        return true;
      })
      .catch((err) => {
        console.warn(err);
        return false;
      });
  }

  shareCalendar(email) {
    // set apiState so that share calendar disables the share button when in waiting/loading state then shows the appropriate message for failure and success
    this.apiState = API_STATES.WAITING;
    //   sendMessage({ shareButtonHandled: API_STATES.WAITING });
    const body = JSON.stringify({
      scope: {
        type: "user",
        value: email,
      },
      role: "reader",
    });
    let init = { ...this.globalInit, method: "POST", body };
    return fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${this.calId}/acl`,
      init
    )
      .then(async (res) => {
        if (res.ok) {
          this.apiState = API_STATES.SUCCESS;

          return res.json();
        }
        return res.text().then((text) => {
          console.error("Error response:", text);
          throw new Error(text);
        });
      })
      .then((data) => {
        console.log(data);
        return true;
      })
      .catch((err) => {
        this.apiState = API_STATES.FAILED;
        console.warn(err);
      });
  }

  async updateCalendar() {
    // update button will be disabled until fetchedJson is filled
    // we need to tell the user how to get the most up to date info

    function fetchAll(urls, method) {
      return Promise.all(
        urls.map(({ url, payload }) => {
          const body = payload ? JSON.stringify(payload) : "";
          console.log("url", url);
          console.log("body", body);
          return fetch(url, {
            ...this.globalInit,
            method,
            body,
          })
            .then((res) => {
              if (res.ok) {
                console.log(res.status);
                return method == "PUT" ? res.json() : res.text();
              }
              throw new Error(res.text());
            })
            .then((data) => {
              console.log(method, " success");
              console.log(data);
            })
            .catch((err) => {
              console.log(method);
              console.warn(err);
            });
        })
      );
    }

    fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${this.calId}/events`,
      {
        ...globalInit,
      }
    )
      .then((res) => {
        if (res.ok) {
          return res.json();
        }
        throw new Error(res.status);
      })
      .then((data) => {
        const events = parseDiff(
          data,
          fetchedJsons.details,
          fetchedJsons.userDetails.timeZoneCode
        );

        console.log(events);

        // addEventsToCalendar(events["POST"], calId);
        console.log(calId, events["PUT"][0]);
        fetchAll(
          events["DELETE"].map((eventId) => ({
            url: `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eventId}`,
          })),
          "DELETE"
        );
        fetchAll(
          events["PUT"].map(({ payload, eventId }) => ({
            url: `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eventId}`,
            payload,
          })),
          "PUT"
        );
      })
      .catch((err) => {
        console.warn(err);
      });
  }

  setCalId(calId) {
    this.calId = calId;
  }

  getCalId() {
    return this.calId;
  }

  setAuthorizationHeader(tokenType, token) {
    this.globalInit.headers = {
      Authorization: `${tokenType} ${token}`,
    };
  }
}

// async deleteCalendars(calIds) {
//   this.apiState = API_STATES.WAITING;
//   sendMessage({ nextPage: Pages.LOADING });
//   const init = { ...globalInit, method: "DELETE" };
//   const results = await Promise.allSettled(
//     calIds.map((id) =>
//       fetch(`https://www.googleapis.com/calendar/v3/calendars/${id}`, init)
//         .then((res) => {
//           // console.log(res.status);
//           return { id, status: res.status };
//         })
//         .catch((err) => {
//           console.log(err);
//           return { id, error: err };
//         })
//     )
//   );

//   // console.log(results);

//   const failed = [];
//   const succeeded = [];

//   for (const result of results) {
//     if (result.status === "fulfilled") {
//       if (
//         result.value.status == 200 ||
//         result.value.status == 204 ||
//         result.value.status == 404
//       ) {
//         succeeded.push(result.value.id);
//       } else {
//         failed.push(result.value.id);
//       }
//     } else {
//       failed.push(result.reason?.id ?? "Unknown");
//     }
//   }

//   if (succeeded.length > 0) {
//     chrome.storage.sync.remove("WFT-Scheduler Calendar ID");
//     // console.log("Successfully removed calendars:", succeeded);
//     apiState = API_STATES.SUCCESS;
//     if (fetchedJsons.userDetails?.firstName) {
//       sendMessage({ nextPage: Pages.INSTRUCTIONS });
//     } else {
//       sendMessage({ nextPage: Pages.FORM });
//     }
//   } else if (failed.length > 0) {
//     // console.log(`failed: ${failed}\nsucceeded: ${succeeded}\nresults: ${results}`)
//     apiState = API_STATES.FAILED;
//     sendMessage({ nextPage: Pages.INSTRUCTIONS });
//     console.warn("Failed to remove calendars:", failed);
//   }

//   // else {
//   //   apiState = API_STATES.IDLE;
//   // }
// }
