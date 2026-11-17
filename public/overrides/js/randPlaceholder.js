// OVERRIDE COPY of legacy /assets/js/randPlaceholder.js (dg repo) — see CLAUDE.md override
// pattern. Diff: randPlaceholderOnMain() no longer prefixes "e.g. "/"пр. " — obviously an
// example, owner found the label redundant.
function randPlaceholder(theLanguage) {

          if ( theLanguage === "en") {

            tasks = ["Start with Sn56.11", 
            "Read sn22.79", 
            "Ponder on mn28", 
            "Practice is in dn22", 
            "Dukkha defined in dn22", 
            "Saṅkhārā are in mn44", 
            "For example sn12.2", 
            "Practices are in an4.162", 
            "Practices are in an4.163", 
            "'The all' is in sn35.23"]; 
          } else if  ( theLanguage === "ru") {
            tasks = ["Начните с Sn56.11", 
            "Прочтите sn22.79", 
            "Подумайте над mn28", 
            "Практика в dn22", 
            "Dukkha в dn22", 
            "Saṅkhārā в mn44", 
            "К примеру sn12.2", 
            "Практики в an4.162", 
            "Практики в an4.163", 
            "'Всё' в sn35.23"];
          }

const random = Math.floor(Math.random() * tasks.length);
// console.log(random, tasks[random]);
document.getElementById('paliauto').placeholder = tasks[random];
}

function randCallToAction() {
   var theLanguage = $('html').attr("lang");
 
  if(theLanguage == "en"){
  //  console.log("your html contains en");
    var tasks = ["Difference between dukkha and domanassa?", "isn't suffering is a mix of dukkha and domanassa?", "Start with Sn56.11", "Read sn22.87", "Ponder on mn28", "Dukkha in Suttas is?", "How many Jhanas in Suttas?",  "Real meaning of Pañña is?", "Dukkha is defined in dn22", "Saṅkhārā in mn44", "Why Tathagata is like ocean?", "Why Dhamma is like Ocean?", "Why Tathagata is like elephant?", "What is the ocean?", "What is the all?", "Difference between dukkha and dukkha ariyasacca?", "Cow in Suttas symbolizes - ..."];
}  else if  ( theLanguage == "ru") {
 //  console.log("your html contains ru");
    var tasks = ["Разница между dukkha и domanassa?", "Разве страдание - это не смесь dukkha и domanassa?", "Начните с Sn56.11", "Прочтите sn22.87", "Подумайте над mn28", "Dukkha в Суттах - это?", "Сколько джхан в Суттах?", "Pañña на самом деле - это ...?", "Определение dukkha есть в dn22", "Saṅkhārā в mn44", "Почему Татхагата, как слон?", "Почему Дхамма, как Океан?", "Почему Татхагата, как Океан?", "Что такое океан?", "Что такое 'всё'?", "Разница между dukkha и dukkha ariyasacca", "Корова в суттах символизирует - ...?"];
          }
const random = Math.floor(Math.random() * tasks.length);
// console.log(random, tasks[random]);
let defaultTitle = document.title
window.onblur = () => {
   //change title, blink title, whatever
   document.title = tasks[random]
}
window.onfocus = () => {
   //back to default title
   document.title = defaultTitle
}
}

function randPlaceholderOnMain() {
   var theLanguage = $('html').attr("lang");
  if(theLanguage == "en"){
    var words = ["Kāyagat","Seyyathāpi","Samudd","Cūḷanik", "elephant", "ocean", "satipaṭṭhānā"];
    var suttas = ["Sn56.11","Dn22","Sn 12 2", "An4 163"]; 
    var or = " or ";
    var example = "";
}  else if  ( theLanguage == "ru") {
    var words = ["Kāyagat","Seyyathāpi","Samudd","Cūḷanik", "Suññat", "Mūsik", "Hatthī", "Слон", "дрессировщик", "satipaṭṭhānā"];
    var suttas = ["Sn 56 11","Dn22","Сн12.2", "an4 163"];
    var or = " или ";

    var example = "";
          }
const randomW = Math.floor(Math.random() * words.length);
const randomS = Math.floor(Math.random() * suttas.length);
// console.log(words[randomW], suttas[randomS]);
// Mixed in: questions in one's own words, which the search by meaning answers (owner 2026-11-17: show that one can
// search by meaning, not only words and numbers). Wording approved by the owner; each one finds its sutta among the
// first three on dhamma.gift (checked 2026-11-17), no other phrase goes here without that check.
var byMeaning = theLanguage == "ru"
    ? ["Где определена dukkha", "Беседа с пятью монахами в Оленьем парке", "Что такое благородный восьмеричный путь",
       "Как возникает dukkha: зависимое возникновение", "Почему пять блоков — не «я»", "Пример с плотом",
       "«Всё» — шесть органов чувств и их объекты", "Ночь пробуждения Будды", "Как развивать дыхания-памятование",
       "Четыре установления памятования", "Что прекращается в ниббане", "Пример с пилой"]
    : ["Where dukkha is defined", "The talk with the five monks in the Deer Park", "What is the noble eightfold path",
       "How dukkha arises, link by link", "The five blocks are not self", "The simile of the raft",
       "\"The all\": the six senses and their objects", "The night of the Buddha's awakening", "How to develop breath-remembrance",
       "The four establishments of remembrance", "What ceases in nibbana", "The simile of the saw"];
var input = document.getElementById('paliauto');
// only a hint that fits the box whole: on a phone «Беседа с пятью монахами в О…» was cut mid-word
function fits(text) {
    try {
        var cs = getComputedStyle(input), ctx = (fits.c = fits.c || document.createElement('canvas')).getContext('2d');
        ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        return ctx.measureText(text).width <= input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 4;
    } catch (e) { return text.length <= 24; }
}
var meaningHint = null;
if (Math.random() < 0.4) {
    var fitting = byMeaning.filter(fits);
    if (fitting.length) meaningHint = fitting[Math.floor(Math.random() * fitting.length)];
}
input.placeholder = meaningHint || example + words[randomW] + or + suttas[randomS];
}
