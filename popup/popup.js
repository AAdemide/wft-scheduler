const wftURL = /https:\/\/wft.homedepot.com\/*/;

const home = window.document.querySelector("#instruction-page");
const calendarMade = document.querySelector("#calendar-made-page");
const deleteCalButton = document.querySelector("#delete-calendar");
const loading = document.querySelector("#loader-page");
const form = document.querySelector("#form-page");
const formButton = form.querySelector("#form-submit");
let calID = {};
const interval = 100;
let countInterval;
const maxInterval = 100;
const Pages = {
  FORM: "form",
  CALENDAR: "calendar",
  INSTRUCTIONS: "instructions",
  LOADING: "loading",
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
  console.log("changed to page", page);
  // form.classList.add("hidden");
  // loading.classList.remove("hidden");
  //   calendarMade.classList.add("hidden");
  //   home.classList.add("hidden");


  if (page == Pages.CALENDAR) {
    calendarMade.classList.remove("hidden");
    form.classList.add("hidden");
    home.classList.add("hidden");
    loading.classList.add("hidden");
  } else if (page == Pages.FORM) {
    form.classList.remove("hidden");
    calendarMade.classList.add("hidden");
    home.classList.add("hidden");
    loading.classList.add("hidden");
  } else if (page == Pages.INSTRUCTIONS) {
    home.classList.remove("hidden");
    form.classList.add("hidden");
    calendarMade.classList.add("hidden");
    loading.classList.add("hidden");

    chrome.runtime.sendMessage({ makeIdle: true }, () => {});
  } 
  // else if (page == Pages.LOADING) {
  //   form.classList.add("hidden");
  //   calendarMade.classList.add("hidden");
  //   home.classList.add("hidden");
  //   loading.classList.remove("hidden");
  // }
}

function apiStatePoll(message, button, timeout = 5000) {
  const startTime = Date.now();
  changePage(Pages.LOADING);
  const poller = setInterval(() => {
    chrome.runtime.sendMessage(message, (res) => {
      console.log("response received in popup.js", res);
      const {apiState, nextPage} = res ?? {};
      console.log(res)
      // console.log("waiting for poll", res, message);
      if (nextPage) {
        console.log("polling should stop");
        button.disabled = false;
        // changePage(Pages.LOADING);
        clearInterval(poller);
        changePage(nextPage);
      } else if (apiState === "failed") {
        button.disabled = false;
        clearInterval(poller);
      } else if (Date.now() - startTime > timeout) {
        console.log("Timeout reached, stopping poll");
        button.disabled = false;
        clearInterval(poller);
      } 
      // else {
      //   changePage(Pages.LOADING);
      // }
    });
  }, interval);
}

window.onload = async function () {
  //calID is private
  calID = await getCalId();

  if (calID) {
    console.log(calID)
    changePage(Pages.CALENDAR);
  } else {
    const loginChecker = setInterval(() => {
      chrome.runtime.sendMessage({ questionReady: true }, (res) => {
        console.log("ready to fetch:", res);
        if (res.ready) {
          changePage(Pages.FORM);
          clearInterval(loginChecker);
        } 
        else if(res.nextPage == Pages.INSTRUCTIONS) {
          changePage(Pages.INSTRUCTIONS);
          // clearInterval(loginChecker);
        } else {
          changePage(Pages.LOADING);
          // clearInterval(loginChecker);
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

    apiStatePoll({ delCal: true, calID }, Pages.FORM, deleteCalButton);
  };
};
