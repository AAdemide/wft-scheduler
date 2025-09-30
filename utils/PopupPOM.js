import { Pages, emailRegex } from "./constants.js";

export default class PopupPOM {
  constructor(calId, sendMessage) {
    this.instructionPage = document.querySelector("#instruction-page");
    this.calendarMade = document.querySelector("#calendar-made-page");
    this.deleteCalButton = document.querySelector("#delete-calendar");
    this.loading = document.querySelector("#loader-page");
    this.form = document.querySelector("#form-page");
    this.failedPage = document.querySelector("#failed-page");
    this.formButton = document.querySelector("#form-submit");
    this.refreshTimeElapsed = document.querySelector("#refresh-time-elapsed");
    this.shareCalForm = document.querySelector("#share-cal");
    this.updateButton = document.querySelector("#update-calendar");
    this.shareButton = document.querySelector("#share-button");
    this.shareInput = document.querySelector("#share-to-gmail");
    this.shareCalSuccess = document.querySelector("#share-cal-success");
    this.shareCalFailed = document.querySelector("#share-cal-failed");
    this.emailErr = document.querySelector("#email-error");
    this.orb = document.getElementById("cursor-orb");
    this.updateCalSuccess = document.querySelector("#update-cal-success");
    this.calUpToDate = document.querySelector("#cal-up-to-date");
    this.modal = document.querySelector("dialog");
    this.modalMessageText = document.querySelector("dialog > p");
    this.eventListenerSetup(calId, sendMessage);
  }

  eventListenerSetup(calId, sendMessage) {
    this.instructionPage.addEventListener(
      "mousemove",
      (e) => {
        const x = e.clientX - 100;
        const y = e.clientY - 150;
        this.orb.style.transform = `translate(${x}px, ${y}px)`;
      },
      { passive: true }
    );

    // questionReady is to check whether thdAuthState [ workforce has been logged into]
    if (calId) {
      this.changePage(Pages.CALENDAR);
      this.shareCalForm.addEventListener("submit", (event) => {
        event.preventDefault();
        sendMessage({
          shareButtonClicked: {
            calId,
            email: event.target[0].value,
          }
        });
        event.target[0].value = "";
        event.target[1].disabled = true;
      });

      this.updateButton.addEventListener("click", () => {
        this.updateButton.disabled = true;
        sendMessage({
          updateButtonClicked: { calId },
        });
      });
    }

    this.shareInput.addEventListener("input",  () => {
      const value = this.shareInput.value.trim();

      const isValidEmail = emailRegex.test(value);

      if (value === "" || isValidEmail) {
        this.emailErr.classList.add("hidden");
      } else {
        this.emailErr.classList.remove("hidden");
      }

      this.shareButton.disabled = !isValidEmail;
    });

    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = this.getFormData();
      sendMessage({ addEvents: true, formData, calId });
    });

    this.deleteCalButton.addEventListener("click", () => {
      sendMessage({ delCal: true, calId });
    });
  }

  async setRefreshTimeElapsed() {
    const res = await chrome.storage.sync.get("refreshTimeElapsed");
    const pastTime = moment(res.refreshTimeElapsed);
    const duration = moment.duration(moment().diff(pastTime));
    this.refreshTimeElapsed.innerText = duration.humanize();
  }

  changePage(page) {
    this.updateButton.disabled = true;

    if (page == Pages.CALENDAR) {
      this.calendarMade.classList.remove("hidden");
      this.form.classList.add("hidden");
      this.instructionPage.classList.add("hidden");
      this.loading.classList.add("hidden");
      this.failedPage.classList.add("hidden");
    } else if (page == Pages.FORM) {
      this.form.classList.remove("hidden");
      this.calendarMade.classList.add("hidden");
      this.instructionPage.classList.add("hidden");
      this.loading.classList.add("hidden");
      this.failedPage.classList.add("hidden");
    } else if (page == Pages.INSTRUCTIONS) {
      this.instructionPage.classList.remove("hidden");
      this.form.classList.add("hidden");
      this.calendarMade.classList.add("hidden");
      this.loading.classList.add("hidden");
      this.failedPage.classList.add("hidden");
    } else if (page == Pages.LOADING) {
      this.form.classList.add("hidden");
      this.calendarMade.classList.add("hidden");
      this.instructionPage.classList.add("hidden");
      this.failedPage.classList.add("hidden");
      this.loading.classList.remove("hidden");
    } else if (page == Pages.FAILED) {
      this.form.classList.add("hidden");
      this.calendarMade.classList.add("hidden");
      this.instructionPage.classList.add("hidden");
      this.loading.classList.add("hidden");
      this.failedPage.classList.remove("hidden");
    }
  }

  flashMessage(element) {
    element.classList.toggle("hidden");
    setTimeout(() => {
      element.classList.toggle("hidden");
    }, 5000);
  }

  getFormData() {
    const formData = {};
    for (let [key, value] of new FormData(this.form)) {
      formData[key] = value;
    }
    return formData;
  }

  setModalMessage(modalMessage) {
    this.modalMessageText.innerText = modalMessage;
  }

  modalOpen() {
    this.modal.showModal();
  }
  
  modalClose() {
    this.modal.close();
  }
}
