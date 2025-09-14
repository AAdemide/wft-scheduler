import { AUTH_STATES, API_STATES } from "./constants.js";
import { parseDiff } from "./utils.js";

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
    console.log(this.calId, init)
    return fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${this.calId}`,
      init
    )
      .then((res) => {
        if (res.ok) {
          return res.text();
        }
        throw new Error(res.status, res.text());
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
          return res.json();
        }
        return res.text().then((text) => {
          throw new Error(text);
        });
      })
      .then((data) => {
        console.log(`${data.scope.value} has been invited to join your calendar`);
        return true;
      })
      .catch((err) => {
        console.warn(err);
        return false;
      });
  }

  async updateCalendar(fetchedSchedule) {
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
      .then(async (calendarEvents) => {
        const events = parseDiff(
          calendarEvents,
          fetchedSchedule,
        );

        if(events.PUT.length == events.POST.length == events.DELETE.length == 0) {
          return false;
        }

        console.log(events);

        await addEventsToCalendar(events["POST"], calId);
        console.log(calId, events["PUT"][0]);
        await fetchAll(
          events["DELETE"].map((eventId) => ({
            url: `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eventId}`,
          })),
          "DELETE"
        );
        await fetchAll(
          events["PUT"].map(({ payload, eventId }) => ({
            url: `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eventId}`,
            payload,
          })),
          "PUT"
        );
        return true;
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
