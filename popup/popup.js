const wftURL = /https:\/\/wft.homedepot.com\/*/;

const home = document.querySelector("#instruction-page");
const calendarMade = document.querySelector("#calendar-made-page");
const deleteCalButton = document.querySelector("#delete-calendar");
const loading = document.querySelector("#loader-page");
const form = document.querySelector("#form-page");
const failedPage = document.querySelector("#failed-page");
const formButton = form.querySelector("#form-submit");
let calID = {};
let port;
const interval = 100;
let countInterval;
const maxInterval = 100;
const Pages = {
  FORM: "form",
  CALENDAR: "calendar",
  INSTRUCTIONS: "instructions",
  LOADING: "loading",
  FAILED: "failed",
};

let currentPage = Pages.LOADING;

const pageElements = {
  home: document.querySelector("#instruction-page"),
  calendarMade: document.querySelector("#calendar-made-page"),
  deleteCalButton: document.querySelector("#delete-calendar"),
  loading: document.querySelector("#loader-page"),
  form: document.querySelector("#form-page"),
  failedPage: document.querySelector("#failed-page"),
  formButton: form.querySelector("#form-submit"),
  refreshTimeElapsed: document.querySelector("#refresh-time-elapsed"),
  addUserForm: document.querySelector("#add-user"),
  updateButton: document.querySelector("#update-calendar"),
  shareButton: document.querySelector("#share-button"),
  shareInput: document.querySelector("#share-to-gmail"),
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
  currentPage = page;
  pageElements.updateButton.disabled = true;
  if (page == Pages.CALENDAR) {
    calendarMade.classList.remove("hidden");
    form.classList.add("hidden");
    home.classList.add("hidden");
    loading.classList.add("hidden");
    failedPage.classList.add("hidden");
  } else if (page == Pages.FORM) {
    form.classList.remove("hidden");
    calendarMade.classList.add("hidden");
    home.classList.add("hidden");
    loading.classList.add("hidden");
    failedPage.classList.add("hidden");
  } else if (page == Pages.INSTRUCTIONS) {
    home.classList.remove("hidden");
    form.classList.add("hidden");
    calendarMade.classList.add("hidden");
    loading.classList.add("hidden");
    failedPage.classList.add("hidden");

    // sendMessage({ makeIdle: true, questionReady: true });
    // sendMessage({ makeIdle: true });
  } else if (page == Pages.LOADING) {
    form.classList.add("hidden");
    calendarMade.classList.add("hidden");
    home.classList.add("hidden");
    failedPage.classList.add("hidden");
    loading.classList.remove("hidden");
  } else if (page == Pages.FAILED) {
    form.classList.add("hidden");
    calendarMade.classList.add("hidden");
    home.classList.add("hidden");
    loading.classList.add("hidden");
    failedPage.classList.remove("hidden");
  }
}

function apiStatePoll(message, timeout = 5000) {
  const poller = setInterval(() => {
    chrome.runtime.sendMessage(message, (res) => {
      const {
        apiState,
        nextPage,
        ready,
        wftAuthenticated,
        shareButtonHandled,
      } = res ?? {};
      if (shareButtonHandled) {
        const shareButton = document.querySelector("#share-button");
        if (shareButtonHandled == "success") {
          shareButton.disabled = false;
          const shareCalSuccess = document.querySelector("#share-cal-success");

          shareCalSuccess.classList.toggle("hidden");
          setTimeout(() => {
            shareCalSuccess.classList.toggle("hidden");
          }, 5000);
          clearInterval(poller);
        } else if (shareButtonHandled == "failed") {
          // failed displayed
          shareButton.disabled = false;
          const shareCalFailed = document.querySelector("#share-cal-failed");

          shareCalFailed.classList.toggle("hidden");
          setTimeout(() => {
            shareCalFailed.classList.toggle("hidden");
          }, 5000);
          clearInterval(poller);
        } else {
          //button disabled
          shareButton.disabled = true;
        }
      } else if (apiState === "failed") {
        clearInterval(poller);
        changePage(Pages.FAILED);
      } else if (ready) {
        //check if authState is successful (not done yet) and if there is a valid calendar ID, show the delete/update page
        if (calID) {
          clearInterval(poller);
          changePage(Pages.CALENDAR);
        }
      }
      // changes to the page requested by the background script
      else if (nextPage) {
        // console.log(nextPage);
        if (nextPage != "loading") {
          // console.log("polling should stop");
          clearInterval(poller);
        }
        changePage(nextPage);
      } else if (apiState === "waiting") {
        changePage(Pages.LOADING);
      }
    });
  }, interval);
}

async function setRefreshTimeElapsed() {
  const refreshTimeElapsed = document.querySelector("#refresh-time-elapsed");
  const res = await chrome.storage.sync.get("refreshTimeElapsed");
  const pastTime = moment(res.refreshTimeElapsed);
  const duration = moment.duration(moment().diff(pastTime));
  refreshTimeElapsed.innerText = duration.humanize();
}

function sendMessage(message) {
  port.postMessage(message);
}

function handleMessage(message, sender) {
  console.log(message, sender);
  const { fetchedJsons, nextPage, updateRefresh } = message;

  // if fetchedJsons == true, check the current page and make the right decision
  if (fetchedJsons == "success" && !calID) {
    console.log(1);
    changePage(Pages.FORM);
  } else if (fetchedJsons == "success" && calID) {
    console.log(2);
    pageElements.updateButton.disabled = false;
  } else if (fetchedJsons == "pending" && !calID) {
    changePage(Pages.LOADING);
  } else if (fetchedJsons == "failed" && !calID) {
    changePage(Pages.INSTRUCTIONS);
  }
  else if (updateRefresh) {
    setRefreshTimeElapsed();
  }
  if (nextPage) {
    changePage(nextPage);
  }
}

function eventListenerSetup() {
  const addUserForm = document.querySelector("#add-user");
  const updateButton = document.querySelector("#update-calendar");
  const errorMsg = document.querySelector("#email-error");
  // Regex to validate gmail/googlemail
  const emailRegex = /^[a-zA-Z0-9._%+~-]+@(gmail\.com|googlemail\.com)$/;
  const orb = document.getElementById("cursor-orb");
  const instructionPage = document.getElementById("instruction-page");

  if (orb && instructionPage) {
    instructionPage.addEventListener(
      "mousemove",
      (e) => {
        const rect = instructionPage.getBoundingClientRect();
        const x = e.clientX - 100;
        const y = e.clientY - 150;
        orb.style.transform = `translate(${x}px, ${y}px)`;
      },
      { passive: true }
    );
  }

  // questionReady is to check whether thdAuthState [ workforce has been logged into]
  if (calID) {
    console.log("calendar exists");
    changePage(Pages.CALENDAR);
    addUserForm.addEventListener("submit", (event) => {
      event.preventDefault();
      sendMessage({
        shareButtonClicked: {
          calID,
          email: "ademideakinsefunmi@gmail.com",
        },
      });
    });

    updateButton.addEventListener("click", () => {
      sendMessage({
        updateButtonClicked: calID,
      });
    });
  }

  pageElements.shareInput.addEventListener("input", function () {
    const value = input.value.trim();

    if (value === "" || emailRegex.test(value)) {
      // Hide error if input is empty or valid
      errorMsg.classList.add("hidden");

      if (emailRegex.test(value)) {
        pageElements.shareButton.disabled = false;
      }
    } else {
      // Show error if input is invalid
      errorMsg.classList.remove("hidden");
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = getFormData();
    sendMessage({ addEvents: true, formData, calID });
  });

  deleteCalButton.addEventListener("click", () => {
    sendMessage({ delCal: true, calID });
  });

  //change to form submit
  pageElements.shareButton.addEventListener("click", () => {
    console.log("share button clicked");
  });
}

window.onload = async function () {
  calID = await getCalId();
  setRefreshTimeElapsed();

  chrome.runtime.sendMessage({ type: "wake-up" }, (response) => {
    port = chrome.runtime.connect({ name: "wftSchedulerEventLoop" });
    port.onMessage.addListener(handleMessage);
  });

  eventListenerSetup();
};
