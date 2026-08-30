// Override of legacy /assets/js/langswitch.js (served instead via public/overrides mount
// priority, see dg-light.js). Legacy toggled classes on #sutta — in dg-node's SPA that div is
// the READER's own content container (search/index.html #reader-pane > #sutta), a completely
// separate DOM subtree from the results table (#search-pane > table#pali). So on the results
// LISTING, clicking #language-button toggled hide-pali/hide-english on an element that isn't an
// ancestor of anything visible there — CSS rules for the table (.quote/.dg-title-lang in
// langswitch.css) never matched, button did nothing (owner: "fake button"), leading to it being
// hidden on results entirely. The reader itself is unaffected — it has its own separate,
// already-correct toggle (megareader.js's window.showPali/showEnglish/showPaliAndTranslation,
// which clones+replaces #language-button once a sutta is opened, taking over from this script).
// Only fix needed here: target #search-pane (the real ancestor of the results table) instead of
// #sutta.
const Sccopy = "/suttacentral.net";
const suttaArea = document.getElementById("search-pane");
//const themeButton = document.getElementById("theme-button");
const bodyTag = document.querySelector("body");
let language = "pli-eng";


  document.addEventListener("keydown", (event) => {
    if ((event.altKey && event.code === "KeyX") || (event.shiftKey && event.code === "Space")) {
    const ShowHideSearchResults = document.getElementById('btn-show-all-children');
//  console.log("Элемент с ID 'btn-show-all-children' найден.");
      if (ShowHideSearchResults) {
     event.preventDefault();
      ShowHideSearchResults.click();
    }
    }
  });


  const languageButton = document.getElementById("language-button");

if (languageButton) {
function setLanguage(language) {
  if (language === "pli-eng") {
    showPaliEnglish();
  } else if (language === "eng") {
    showEnglish();
  } else if (language === "pli") {
    showPali();
  }
}
function showPaliEnglish() {
//  console.log("showing Pali eng");
  suttaArea.classList.remove("hide-pali");
  suttaArea.classList.remove("hide-english");
}
function showEnglish() {
//  console.log("showing eng");
  suttaArea.classList.add("hide-pali");
  suttaArea.classList.remove("hide-english");
}
function showPali() {
//  console.log("showing pali");
  suttaArea.classList.remove("hide-pali");
  suttaArea.classList.add("hide-english");
}



function toggleThePali() {

  if (localStorage.paliToggleSearch) {
    if (localStorage.paliToggleSearch === "pli-eng") {
      showPaliEnglish();
    } else if (localStorage.paliToggleSearch === "pli") {
      showPali();
    } else if (localStorage.paliToggleSearch === "eng") {
      showEnglish();
    }
  } else {
    localStorage.paliToggleSearch = "pli-eng";
  }

  languageButton.addEventListener("click", () => {
    if (language === "pli-eng") {
	  showPali();
	  language = "pli";
     localStorage.paliToggleSearch = "pli";
     localStorage.paliToggleRuSearch = "pli";
    } else if (language === "pli") {
     showEnglish();
      language = "eng";
      localStorage.paliToggleSearch = "eng";
      localStorage.paliToggleRuSearch = "rus";
    } else if (language === "eng") {
     showPaliEnglish();
      language = "pli-eng";
localStorage.paliToggleSearch = "pli-eng";
localStorage.paliToggleRuSearch = "pli-rus";
    }
  });

}
      toggleThePali();

      // Добавляем обработчик сочетания клавиш Alt + S (физическая клавиша)
  document.addEventListener("keydown", (event) => {
    if ((event.altKey && event.code === "Space") || (event.altKey && event.code === "KeyZ")) {
      // Имитируем клик по кнопке
      event.preventDefault();
      languageButton.click();
    }
  });

}
