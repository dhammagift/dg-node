const Sccopy = "/suttacentral.net";
const suttaArea = document.getElementById("sutta");
const homeButton = document.getElementById("home-button");
const fdgButton = document.getElementById("fdg-button");

const bodyTag = document.querySelector("body");
const previous = document.getElementById("previous");
const next = document.getElementById("next");
const previous2 = document.getElementById("previous2");
const next2 = document.getElementById("next2");
const form = document.getElementById("form");
const citation = document.getElementById("paliauto");
const pathLang = "ru";

let language = "pli-2nd";

homeButton.addEventListener("click", () => {
  document.location.search = "";
});

// Делаем функцию асинхронной, чтобы использовать await вместо PHP
async function buildSutta(slug) {
  
  let translator = "";
  let texttype = "sutta";
  let slugArray = slug.split("&");
  slug = slugArray[0];
  if (slugArray[1]) {
    translator = slugArray[1];
  } 
  
  slug = slug.toLowerCase();

  // Определение типа текста
  if ((!slug.match("bu-pm")) && (!slug.match("bi-pm")) && (slug.match(/bu-|bi-|kd|pvr/))) {
    texttype = "vinaya";
    slug = slug.replace(/bu([psan])/, "bu-$1");
    slug = slug.replace(/bi([psan])/, "bi-$1");
    if (!slug.match("pli-tv-")) {
      slug = "pli-tv-" + slug;
    }
    if (!slug.match("vb-")) {
      slug = slug.replace("bu-", "bu-vb-");
    }
    if (!slug.match("vb-")) {
      slug = slug.replace("bi-", "bi-vb-");
    }
  }

  if (slug.match(/bu-pm|bi-pm/)) {
    texttype = "vinaya";
    slug = slug.replace(/bu([psan])/, "bu-$1");
    slug = slug.replace(/bi([psan])/, "bi-$1");
    if (!slug.match("pli-tv-")) {
      slug = "pli-tv-" + slug;
    }
  }
  
  let html = `<div class="button-area"><button title="Переключить язык (Atl+Z или Alt+Space)" id="language-button" class="hide-button">Pāḷi Рус</button></div>`;
  const slugReady = parseSlug(slug);

  // Запрашиваем переводчика напрямую через JS функцию из common.js
  if (translator === "") {
      translator = await getTranslator(texttype, slug, pathLang);
  }

  const onlynumber = slug.replace(/[a-zA-Z]/g, '');
  let params = new URLSearchParams(document.location.search);
  let script = params.get("script");
  const savedScript = localStorage.getItem('selectedScript');

  // Пути к Root файлам
  let rootpath = `${Sccopy}/sc-data/sc_bilara_data/root/pli/ms/${texttype}/${slugReady}_root-pli-ms.json`;
  if (script === "devanagari" || savedScript === "Devanagari") {
      rootpath = `/assets/texts/devanagari/root/pli/ms/${texttype}/${slugReady}_rootd-pli-ms.json`;
  } else if (script === "thai" || savedScript === "Thai") {
      rootpath = `/assets/texts/th/root/pli/ms/${texttype}/${slugReady}_rootth-pli-ms.json`;
  } 

  var rustrnpath = `/assets/texts/ru/${texttype}/${slugReady}_translation-${pathLang}-${translator}.json`;
  var htmlpath = `${Sccopy}/sc-data/sc_bilara_data/html/pli/ms/${texttype}/${slugReady}_html.json`;

  const ruUrl  = window.location.href;
  const mlUrl = ruUrl.replace("/r/", "/ml/");
  const mtUrl = ruUrl.replace("/r/", "/mt/");
  let scLink = `<p class="sc-link">
  <a target="" title='Pali + Русский + Русский' href="${mtUrl}">R+R</a>
  <a target="" title='Pali + Русский + Английский (Alt+2)' href="${mlUrl}">R+E</a>
  `;
  const currentURL = window.location.href;
  const anchorURL = new URL(currentURL).hash; 

  var trnpath = rustrnpath;

  // ЛОГИКА ПУТЕЙ И ПЕРЕВОДЧИКОВ
  if (slug.includes("mn"))  {
      trnpath = rustrnpath; 
      language = "pli-2nd";
  } else if (slug.match(/sn|an|dn|thig|thag|iti|ud|snp|dhp|kp/)) { 
      trnpath = rustrnpath; 
  } else if (typeof knranges !== 'undefined' && knranges.indexOf(slug) !== -1) { 
      trnpath = rustrnpath; 
  } else if (slug.match(/ja/)) {
      language = "pli";
      let slugNumber = parseInt(slug.replace(/\D/g, ''), 10);

      if (slugNumber >= 1 && slugNumber <= 75) {
          trnpath = `${Sccopy}/sc-data/sc_bilara_data/translation/en/sujato/sutta/${slugReady}_translation-en-sujato.json`;
      } else if (slugNumber > 70) {
          trnpath = `${Sccopy}/sc-data/sc_bilara_data/root/pli/ms/${texttype}/${slugReady}_root-pli-ms.json`;
      }
  } else if ( texttype === "sutta" ) {
      translator = "sujato";
      const fallbackLang = "en";
      trnpath = `${Sccopy}/sc-data/sc_bilara_data/translation/${fallbackLang}/${translator}/${texttype}/${slugReady}_translation-${fallbackLang}-${translator}.json`;
  } else if (slug.match(/bu-pm|bi-pm/)) {
      if (slug.match(/bi-pm/)) {
          if (translator === "o" || translator === "") translator = "adelina";
      } else {
          if (translator === "o" || translator === "") translator = "gemini";
      }
      
      trnpath = `/assets/texts/${pathLang}/${texttype}/${slug}_translation-${pathLang}-${translator}.json`;
      htmlpath = `/assets/html/${texttype}/${slug}_html.json`;
      
      // Корректировка rootpath для Патимоккхи
      if (script === "devanagari" || savedScript === "Devanagari") {
          rootpath = `/assets/texts/devanagari/root/pli/ms/${texttype}/${slug}_rootd-pli-ms.json`;
      } else if (script === "thai" || savedScript === "Thai") {
          rootpath = `/assets/texts/th/root/pli/ms/${texttype}/${slug}_rootth-pli-ms.json`;
      } else {
          rootpath = `${Sccopy}/sc-data/sc_bilara_data/root/pli/ms/${texttype}/${slug}_root-pli-ms.json`;
      }
  } else if ( texttype === "vinaya" ) {
      if (typeof vinayaranges !== 'undefined' && vinayaranges.indexOf(slug) !== -1) { 
          trnpath = rustrnpath; 
      } else {
          translator = "brahmali";
          const fallbackLang = "en";
          trnpath = `${Sccopy}/sc-data/sc_bilara_data/translation/${fallbackLang}/${translator}/${texttype}/${slugReady}_translation-${fallbackLang}-${translator}.json`;
      }
  }  

  var varpath = `${Sccopy}/sc-data/sc_bilara_data/variant/pli/ms/${texttype}/${slugReady}_variant-pli-ms.json`;
  var varpathLocal = `/assets/texts/variant/${texttype}/${slugReady}_variant-pli-ms.json`;

  const rootResponse = fetch(rootpath)
    .then(response => {
      if (!response.ok) throw new Error('Root file not found');
      return response.json();
    })
    .catch(error => {
      // Переключаем на второй путь
      rootpath = `${Sccopy}/sc-data/sc_bilara_data/root/pli/ms/${texttype}/${slugReady}_root-pli-ms.json`;
      return fetch(rootpath).then(res => res.ok ? res.json() : {});
    });

  const translationResponse = fetch(trnpath).then(response => response.json());
  const htmlResponse = fetch(htmlpath).then(response => response.json());
  const varResponse = window.fetchVariantData ? window.fetchVariantData(varpathLocal, varpath) : Promise.resolve({});

  Promise.all([rootResponse, translationResponse, htmlResponse, varResponse]).then(responses => {
      const [paliData, transData, htmlData, varData] = responses;
      
      // ПОИСК ОКОНЧАТЕЛЬНОГО ПРАВИЛА СТРОГО ПО HTML КЛАССУ
      let finalRulingAnchor = "";
      if (slug.includes("bu-") || slug.includes("bi-")) {
          for (let seg in htmlData) {
              if (htmlData[seg] && htmlData[seg].includes("patimokkha")) {
                  finalRulingAnchor = seg.substring(seg.indexOf(':') + 1);
                  break;
              }
          }
      }

      const segments = (typeof window.mergeGathas === 'function') ? 
          window.mergeGathas(htmlData, paliData, transData, varData) : Object.keys(htmlData);
      
      for (let i = 0; i < segments.length; i++) {
        let segment = segments[i];

        let [openHtml, closeHtml] = htmlData[segment].split(/{}/);
        openHtml = openHtml || ''; 
        closeHtml = closeHtml || ''; 

        let startIndex = segment.indexOf(':') + 1;
        let anchor = segment.substring(startIndex);

        if (slug.includes('-') && (slug.includes('an') || slug.includes('sn') || slug.includes('dhp'))) {
          anchor = segment;
        }

        var fullUrlWithAnchor = window.location.href.split('#')[0] + '#' + anchor;

         window.applyRemovePunct(paliData, segment);

        let finder = (params.get("s") || "").replace(/ṃ/g, "ṁ");
        if (finder && finder.trim() !== "") {
          let regex = new RegExp(finder, 'gi');
          try {
            if (paliData[segment]) paliData[segment] = paliData[segment].replace(regex, match => `<b class='match finder'>${match}</b>`);
            if (transData[segment]) transData[segment] = transData[segment].replace(regex, match => `<b class="match finder">${match}</b>`);
            if (varData[segment]) varData[segment] = varData[segment].replace(regex, match => `<b class="match finder">${match}</b>`);
          } catch (error) {}
        }

        const linkToCopyStart = `<a class="text-decoration-none copyLink copyLink-start" onclick="copyToClipboard('${fullUrlWithAnchor}')"></a>`;
        let linkToCopy = `<a class="text-decoration-none copyLink" onclick="copyToClipboard('${fullUrlWithAnchor}')"></a>`;

        if (paliData[segment] !== undefined && transData[segment] !== undefined && varData[segment] !== undefined) {
          html += `${openHtml}<span id="${anchor}">
              <span class="pli-lang " lang="pi">${linkToCopyStart}${paliData[segment].trim()}${linkToCopy}
        <font class="variant"><br>${linkToCopyStart}${varData[segment].trim()}${linkToCopy}</font>     
              </span>
              <span class="rus-lang" lang="ru">${linkToCopyStart}${transData[segment].trim()}${linkToCopy}</span>
              </span>${closeHtml}\n\n`;
        } else if (paliData[segment] !== undefined && transData[segment] !== undefined) {
          html += `${openHtml}<span id="${anchor}">
              <span class="pli-lang " lang="pi">${linkToCopyStart}${paliData[segment].trim()}${linkToCopy}</span>
              <span class="rus-lang" lang="ru">${linkToCopyStart}${transData[segment].trim()}${linkToCopy}</span>
              </span>${closeHtml}\n\n`;
        } else if (paliData[segment] !== undefined) {
          html += openHtml + '<span id="' + anchor + '"><span class="pli-lang inputscript-ISOPali" lang="pi">' + linkToCopyStart + paliData[segment].trim() + linkToCopy + '</span></span>' + closeHtml + '\n\n';
        } else if (transData[segment] !== undefined) {
          html += openHtml + '<span id="' + anchor + '"><span class="rus-lang" lang="ru">' + linkToCopyStart + transData[segment].trim() + linkToCopy + '</span></span>' + closeHtml + '\n\n';
        }
      }

      // Подготовка красивого имени переводчика
      let translatorforuser = translator;
      if (window.siteTranslators && window.siteTranslators[pathLang] && window.siteTranslators[pathLang][translator]) {
          translatorforuser = window.siteTranslators[pathLang][translator];
      } else if (window.siteTranslators && window.siteTranslators["en"] && window.siteTranslators["en"][translator]) {
          translatorforuser = window.siteTranslators["en"][translator];
      } 

      const translatorByline = `<div id="trn" class="byline">
       <p>
      <span class="pli-lang" lang="pi">Pāḷi <a class="text-decoration-none text-reset" href="/assets/texts/abbr.html?s=ms" title="Mahāsaṅgīti Pāḷi">MS</a></span> <span class="rus-lang" lang="ru"> Пер. ${translatorforuser}</span>
       </p>
       </div>`;
    
      const enUrl = window.location.href.replace("/r/", "/read/");
      scLink += `<a title='Английский (Alt+1)' href="${enUrl}">En</a>&nbsp;`;

      const origUrl = window.location.href;
      let dUrl = origUrl.replace("/r/", "/d/");
      let thUrl = origUrl.replace("/r/", "/th/read/");

      const SHOW_CLOSE_AFTER = 10;
      let viewCount = parseInt(localStorage.getItem('warningViewCount')) || 0;
      viewCount++;
      localStorage.setItem('warningViewCount', viewCount);
      const canShowClose = viewCount >= SHOW_CLOSE_AFTER;
      const isWarningClosed = localStorage.getItem('warningClosed');

      const warning = `
        <div class="warning-container warning-box">
          <p class='warning'>
            <strong>Заметка:</strong><a class='text-decoration-none cursor-pointer' target='' href='${dUrl}'>&nbsp;</a>Переводы, словари и комментарии сделаны не Благословенным.<a class='text-decoration-none cursor-pointer' target='' href='${thUrl}'>&nbsp;</a>Сверяйтесь с Пали в 4 основных никаях.
                 ${canShowClose && !isWarningClosed ? `<span class="close-warning">×</span>` : ''} 
          </p>
        </div>
      `;

      suttaArea.innerHTML = 
          `<div id="top-links-container" class="min-h-24"></div><br>` + 
          (!isWarningClosed ? warning : '') + 
          translatorByline + 
          html + 
          translatorByline + 
          (!isWarningClosed ? warning : '') + 
          `<div id="bottom-links-container" class="min-h-24"></div>`;
     
      window.dispatchEvent(new Event('suttaLoaded'));
      if (typeof window.setupVariantVisibility === 'function') {
          window.setupVariantVisibility();
      }

      if (canShowClose && !isWarningClosed) {
        document.querySelectorAll('.close-warning').forEach(btn => {
          btn.addEventListener('click', function() {
            localStorage.setItem('warningClosed', 'true');
            document.querySelectorAll('.warning-container').forEach(el => el.remove());
          });
        });
      }

          toggleThePali();

      if (typeof generateThirdPartyLinks === 'function') {
          scLink += generateThirdPartyLinks(slug, slugReady, texttype, translator);
      }
      
      // ВЫВОД ССЫЛКИ FINAL
      if (finalRulingAnchor) {
          scLink += `&nbsp;<a href="#${finalRulingAnchor}" title="К окончательному правилу">Final</a>`;
      }
      
      scLink += "</p>";

      const topContainer = document.getElementById('top-links-container');
      const bottomContainer = document.getElementById('bottom-links-container');
      if (topContainer) topContainer.innerHTML = scLink;
      if (bottomContainer) bottomContainer.innerHTML = scLink;

      if (typeof renderNavigation === 'function') {
          renderNavigation(slug, slugReady);
      }
      if (typeof addToSearchHistory === 'function') {
          addToSearchHistory();
      }

  }).catch(error => {
      console.log('Error fetching sutta data:', error);
      if (typeof window.handleFetchError === 'function') {
          window.handleFetchError(slug, true); // true = русский интерфейс
      }
  });

}

if (document.location.search) {
  let params = new URLSearchParams(document.location.search);
  let slug = params.get("q");
  let lang = params.get("lang");

  citation.value = slug;
  buildSutta(slug);
  
  if (lang) {
    language = lang;
    setLanguage(lang);
  } else if  (localStorage.paliToggle) {
    language = localStorage.paliToggle; 
    setLanguage(language);
  } 
} else {
  // Вызываем нашу новую глобальную функцию, передавая язык скрипта
  if (typeof window.getInstructionHTML === 'function') {
      suttaArea.innerHTML = window.getInstructionHTML(pathLang);
      
      // Заново вешаем слушатели на кнопки, так как мы только что перерисовали HTML
      const abbreviations = document.querySelectorAll("span.abbr");
      abbreviations.forEach(book => {
        book.addEventListener("click", e => {
          citation.value = e.target.innerHTML;
          citation.focus();
        });
      });
  } else {
      suttaArea.innerHTML = `<p>Инструкции загружаются...</p>`;
  }
}


function setLanguage(language) {
  if (language === "pli-2nd") {
    showPaliEnglish();
  } else if (language === "pli") {
    showPali();
  } else if (language === "2nd") {
    showEnglish();
  }
}

function showPaliEnglish() {
  suttaArea.classList.remove("hide-pali");
  suttaArea.classList.remove("hide-english");
  suttaArea.classList.remove("hide-russian");
  
  const savedMode = localStorage.getItem('viewMode') || 'alternate';
  if (savedMode === 'columns') {
    suttaArea.classList.add('column-view');
  }
}

function showEnglish() {
  suttaArea.classList.add("hide-pali");
  suttaArea.classList.remove("hide-english");
  suttaArea.classList.remove("hide-russian");
  suttaArea.classList.remove('column-view');
}

function showPali() {
  suttaArea.classList.remove("hide-pali");
  suttaArea.classList.add("hide-english");
  suttaArea.classList.add("hide-russian");
  suttaArea.classList.remove('column-view');
}


const abbreviations = document.querySelectorAll("span.abbr");
abbreviations.forEach(book => {
  book.addEventListener("click", e => {
    citation.value = e.target.innerHTML;
    citation.focus();
  });
});
