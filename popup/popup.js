import {
  API_STATES,
  Pages,
  THD_AUTH_STATES,
  emailRegex,
} from "../utils/constants.js";
import PopupPOM from "../utils/popupPOM.js";

let calId = {};
let port;
let pom;

async function getCalId() {
  const myID = await chrome.storage.sync.get("WFT-Scheduler Calendar ID");
  return myID["WFT-Scheduler Calendar ID"] ?? null;
}

function sendMessage(message) {
  if (port) {
    port.postMessage(message);
    return;
  }

  chrome.runtime.sendMessage({ type: "wake-up" }, (response) => {
    console.log(response);
    port = chrome.runtime.connect({ name: "wftSchedulerEventLoop" });
    port.onMessage.addListener(handleMessage);
    port.onDisconnect.addListener(() => {
      port = null;
    });
    port.postMessage(message);
  });
}

function handleMessage(message, _sender) {
  // console.log(message);
  const {
    fetchedJsons,
    nextPage,
    updateRefresh,
    shareButtonHandled,
    updateButtonClicked,
  } = message;

  if (fetchedJsons == THD_AUTH_STATES.AUTH_SUCCESS && !calId) {
    pom.changePage(Pages.FORM);
  } else if (fetchedJsons == THD_AUTH_STATES.AUTH_SUCCESS && calId) {
    pom.updateButton.disabled = false;
  } else if (fetchedJsons == THD_AUTH_STATES.AUTHENTICATING && !calId) {
    pom.changePage(Pages.LOADING);
  } else if (fetchedJsons == THD_AUTH_STATES.AUTH_FAILED && !calId) {
    pom.changePage(Pages.INSTRUCTIONS);
  } else if (updateRefresh) {
    setRefreshTimeElapsed();
  } else if (shareButtonHandled == API_STATES.SUCCESS) {
    pom.shareCalSuccess.classList.toggle("hidden");
    setTimeout(() => {
      pom.shareCalSuccess.classList.toggle("hidden");
    }, 5000);
  } else if (shareButtonHandled == API_STATES.FAILED) {
    pom.shareCalFailed.classList.toggle("hidden");
    setTimeout(() => {
      pom.shareCalFailed.classList.toggle("hidden");
    }, 5000);
  } else if (updateButtonClicked == API_STATES.SUCCESS) {
    console.log("updates where made");
  } else if (updateButtonClicked == API_STATES.FAILED) {
    console.log("your calendar is already up to date");
  }
  if (nextPage) {
    pom.changePage(nextPage);
  }
}

window.onload = async function () {
  calId = await getCalId();
  pom = new PopupPOM(calId, sendMessage);
  pom.setRefreshTimeElapsed();

  chrome.runtime.sendMessage({ type: "wake-up" }, (_res) => {
    port = chrome.runtime.connect({ name: "wftSchedulerEventLoop" });
    port.onMessage.addListener(handleMessage);
  });

};
