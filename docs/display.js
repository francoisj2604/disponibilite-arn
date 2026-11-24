import {request,labels,clock,date,demo} from "./common.js";
import {currentStatus} from "./status.js";
let data, updated = 0, failed = false, loading = false;
const $ = id => document.getElementById(id);
const keyStorage = "availability-display-key";
const preview = new URLSearchParams(location.search).has("apercu");
if (preview) document.body.classList.add("display-preview");
let displayKey = demo || preview ? "" : localStorage.getItem(keyStorage) || "";
$("displaySettings").hidden = demo || preview;
async function changeKey(value) {
  displayKey = value;
  if (value) localStorage.setItem(keyStorage,value);
  else localStorage.removeItem(keyStorage);
  if (data?.status) delete data.status.names;
  render();
  await refresh();
}
$("displayAccess").onsubmit = event=>{
  event.preventDefault();
  const key = $("displayKey").value.trim();
  $("displayKey").value = "";
  $("displaySettings").open = false;
  changeKey(key);
};
$("forget").onclick = ()=>changeKey("");
const bookingMessage = "Vous pouvez prendre un rendez-vous\nDirectement sur l’app <strong>Aide numérique</strong> ou en scannant le QR code";
const bookingModes = new Set(["away", "class", "meeting"]);
const descriptions = {available:"Bienvenue ! Vous pouvez entrer !",reunion:"Merci de repasser après la réunion.",support:"Je suis en dépannage dans un autre local.",timetable:"Vous pouvez me retrouver au local Horaires.",unknown:"La disponibilité ne peut pas être confirmée."};
const portraits = {
  available:"disponible.png",
  class:"occupe.png",
  meeting:"occupe.png",
  reunion:"occupe.png",
  away:"absent.png",
  support:"occupe.png",
  timetable:"occupe.png"
};
const memoji = $("memoji");
memoji.onload = ()=>{memoji.hidden = !memoji.hasAttribute("src");};
memoji.onerror = ()=>{memoji.hidden = true;};

function render() {
  const now = new Date();
  $("clock").textContent = clock.format(now);
  $("date").textContent = date.format(now);
  if (!data && !failed) return;
  const live = data && Date.now() - updated < 45000;
  const status = live ? (data.status || currentStatus(data,now)) : {mode:"unknown"};
  $("hero").dataset.mode = status.mode;
  const portrait = portraits[status.mode];
  if (portrait && memoji.dataset.portrait !== portrait) {
    memoji.hidden = true;
    memoji.dataset.portrait = portrait;
    memoji.src = new URL("./images/" + portrait + "?v=portraits", import.meta.url).href;
  } else if (!portrait && memoji.hasAttribute("src")) {
    memoji.hidden = true;
    delete memoji.dataset.portrait;
    memoji.removeAttribute("src");
  }
  $("status").textContent = labels[status.mode];
  const names = !failed && status.until > +now ? status.names || [] : [];
  const subtitle = status.mode === "class" ? [status.course,status.className].filter(Boolean) : names;
  $("guest").hidden = !subtitle.length;
  $("guest").textContent = subtitle.join(" · ");
  const message = status.messageUntil > +now ? status.message || "" : "";
  $("message").hidden = !message;
  $("message").textContent = message;
  const until = status.until > +now ? "Jusqu’à " + clock.format(status.until) : "";
  const detail = !message && bookingModes.has(status.mode) ? bookingMessage :
    !message && !until ? descriptions[status.mode] : "";
  $("until").textContent = until;
  $("until").hidden = !until;
  if (detail === bookingMessage) {
    if (!$("detail").firstElementChild) $("detail").innerHTML = bookingMessage;
  } else {
    $("detail").textContent = detail || "";
  }
  $("detail").hidden = !detail;
  $("connection").textContent = demo ? "Démonstration locale" : failed ? "Connexion interrompue" :
    data.sync && Date.now() - data.sync > 20*60000 ? "Agenda à vérifier" : "Actualisé à " + clock.format(updated);
}
async function refresh() {
  if (loading) return;
  loading = true;
  const token = displayKey;
  try {
    const next = await request("/status",{token});
    if (token !== displayKey && next.status) delete next.status.names;
    data = next;
    updated = Date.now();
    failed = false;
  }
  catch { failed = true; }
  finally { loading = false; render(); }
}
setInterval(render,1000);
setInterval(refresh,5000);
document.addEventListener("visibilitychange",()=>{if (!document.hidden) refresh();});
refresh();
