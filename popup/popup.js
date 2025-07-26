const wftURL = /https:\/\/wft.homedepot.com\/*/;

const home = window.document.querySelector("main");
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
  if (page == Pages.CALENDAR) {
    form.classList.add("hidden");
    home.classList.add("hidden");
    calendarMade.classList.remove("hidden");
  } else if (page == Pages.FORM) {
    form.classList.remove("hidden");
    calendarMade.classList.add("hidden");
    home.classList.add("hidden");
  } else if (page == Pages.HOME) {
    form.classList.add("hidden");
    calendarMade.classList.add("hidden");
    home.classList.remove("hidden");

    chrome.runtime.sendMessage({ makeIdle: true }, () => {});
  }
}

function apiStatePoll(message, page, button, timeout = 5000) {
  const startTime = Date.now();
  const poller = setInterval(() => {
    chrome.runtime.sendMessage(message, (res) => {
      console.log("response received in popup.js", res);
      const apiState = res.apiState;
      // console.log("waiting for poll", res, message);
      if (apiState === "waiting") {
        // console.log("waiting for something");
      } else if (apiState === "success") {
        changePage(page);
        button.disabled = false;
        clearInterval(poller);
      } else if (apiState === "failed") {
        button.disabled = false;
        clearInterval(poller);
      } else if (Date.now() - startTime > timeout) {
        console.log("Timeout reached, stopping poll");
        button.disabled = false;
        clearInterval(poller);
      }
    });
  }, interval);
}

window.onload = async function () {
  //calID is private
  calID = await getCalId();

  if (calID) {
    changePage(Pages.CALENDAR);
  } else {
    const loginChecker = setInterval(() => {
      chrome.runtime.sendMessage({ questionReady: true }, (res) => {
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

    apiStatePoll(
      { addEvents: true, formData, calID },
      Pages.CALENDAR,
      formButton
    );
  };

  deleteCalButton.onclick = async () => {
    calID = await getCalId();

    deleteCalButton.disabled = true;

    apiStatePoll({ deleteCalendar: true, calID }, Pages.FORM, deleteCalButton);
  };
};
