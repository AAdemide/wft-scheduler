const wftURL = /https:\/\/wft.homedepot.com\/*/;

const main = window.document.querySelector("main");
const form = document.querySelector("form");
const calendarMade = document.querySelector("#calendar-made");
const deleteCalButton = document.querySelector("#delete-calendar");
const formButton = form.querySelector("form > button");
let calID = {};
const interval = 100;
let countInterval;
const maxInterval = 100;
const Pages = {
  FORM: "form",
  CALENDAR: "calendar",
  HOME: "home",
};

function getFormData() {
  const formData = {};
  for (let [key, value] of new FormData(form)) {
    formData[key] = value;
  }
  return formData;
}

async function getCalId() {
  const myID = await chrome.storage.sync.get("WFT-Scheduler Calendar ID");
  return myID["WFT-Scheduler Calendar ID"] ?? null;
}

function changePage(page) {
  if (page == "calendar") {
    form.classList.add("hidden");
    main.classList.add("hidden");
    calendarMade.classList.remove("hidden");
  } else if (page == "form") {
    form.classList.remove("hidden");
    calendarMade.classList.add("hidden");
    main.classList.add("hidden");
  } else {
    form.classList.add("hidden");
    calendarMade.classList.add("hidden");
    main.classList.remove("hidden");
  }
}

function apiStatePoll(message, page, button) {
  const poller = setInterval(() => {
    chrome.runtime.sendMessage(message, ({ apiState }) => {
      if (apiState === "success") {
        changePage(page);
        button.disabled = false;
        clearInterval(poller);
      } else if (apiState === "failed") {
        button.disabled = false;
        clearInterval(poller);
      }
    });
  }, interval);
}

window.onload = async function () {
  calID = await getCalId();
  console.log(calID);

  if (calID) {
    changePage(Pages.CALENDAR);
  } else {
    const loginChecker = setInterval(() => {
      chrome.runtime.sendMessage({ question: "ready" }, (res) => {
        console.log("ready to fetch:", res.ready);
        if (res.ready) {
          clearInterval(loginChecker);
          changePage(Pages.FORM);
        } else {
          changePage(Pages.HOME);
        }
      });
    }, interval);
  }

  form.onsubmit = async (event) => {
    event.preventDefault();
    formButton.disabled = true;

    calID = await getCalId();

    const formData = getFormData();

    apiStatePoll({ add: "events", formData, calID }, Pages.CALENDAR, formButton);
  };

  deleteCalButton.onclick = async () => {
    calID = await getCalId();

    deleteCalButton.disabled = true;

    apiStatePoll({ delete: "calendar", calID }, Pages.FORM, deleteCalButton);
  };
};
