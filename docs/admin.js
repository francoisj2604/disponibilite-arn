import {request,labels,clock,date,demo} from "./common.js";
import {currentStatus} from "./status.js";
const $ = id => document.getElementById(id);
const weekdays = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const ipadScreen = $("ipadScreen");
const ipadFrame = ipadScreen.querySelector("iframe");

new ResizeObserver(([entry]) => {
  ipadFrame.style.setProperty("--ipad-scale", entry.contentRect.width / 1024);
}).observe(ipadScreen);

let token = "";
let savedSlots = [];
function renderTimetable(slots) {
  const minutes = time => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const days = weekdays.slice(0, slots.some(slot => slot.day > 4) ? 7 : 5);
  const first = Math.floor(Math.min(8 * 60, ...slots.map(slot => minutes(slot.start))) / 60) * 60;
  const last = Math.ceil(Math.max(15 * 60, ...slots.map(slot => minutes(slot.end))) / 60) * 60;
  const position = minute => (minute - first) / (last - first) * 100 + "%";
  const grid = $("weeklyRows");
  grid.style.setProperty("--days", days.length);
  grid.style.setProperty("--hours", (last - first) / 60);
  const axis = document.createElement("div");
  axis.className = "timetable-axis";
  for (let minute = first; minute <= last; minute += 60) {
    const tick = document.createElement("span");
    tick.style.top = position(minute);
    tick.textContent = String(minute / 60).padStart(2,"0") + ":00";
    axis.append(tick);
  }
  grid.replaceChildren(document.createElement("div"));
  for (const day of days) {
    const name = document.createElement("strong");
    name.className = "timetable-day";
    name.textContent = day;
    grid.append(name);
  }
  grid.append(axis);
  days.forEach((day, index) => {
    const lane = document.createElement("div");
    lane.className = "timetable-lane";
    lane.setAttribute("aria-label", day);
    const daily = slots.filter(slot => slot.day === index);
    const bounds = [...new Set(daily.flatMap(slot => [minutes(slot.start), minutes(slot.end)]))].sort((a,b)=>a-b);
    const blocks = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const start = bounds[i], end = bounds[i + 1];
      const active = daily.filter(slot => minutes(slot.start) <= start && minutes(slot.end) >= end);
      const slot = active.find(slot => slot.mode === "class") || active.find(slot => slot.mode === "available");
      if (!slot) continue;
      const prev = blocks.at(-1);
      if (prev?.slot === slot && prev.end === start) prev.end = end;
      else blocks.push({slot,start,end});
    }
    const format = value => String(Math.floor(value / 60)).padStart(2,"0") + ":" + String(value % 60).padStart(2,"0");
    for (const {slot,start,end} of blocks) {
      const block = document.createElement("div");
      block.className = "timetable-block";
      block.dataset.mode = slot.mode;
      block.style.top = position(start);
      block.style.bottom = position(last - end + first);
      const time = document.createElement("small");
      time.textContent = format(start) + "–" + format(end);
      const caption = document.createElement("span");
      caption.textContent = [labels[slot.mode], slot.course, slot.className].filter(Boolean).join(" · ");
      block.title = time.textContent + " · " + caption.textContent;
      block.append(time,caption);
      lane.append(block);
    }
    if (!daily.length) {
      const empty = document.createElement("span");
      empty.className = "timetable-empty";
      empty.textContent = "Indisponible";
      lane.append(empty);
    }
    grid.append(lane);
  });
}
function update(state) {
  savedSlots = state.slots;
  renderTimetable(savedSlots);
  const status = currentStatus(state);
  $("liveStatus").dataset.mode = status.mode;
  $("current").textContent = "Affichage actuel · " + labels[status.mode] +
    (status.message ? " · " + status.message : "");
  $("sync").textContent = state.sync ? "Dernière synchronisation Bookings · " + date.format(state.sync) + " à " + clock.format(state.sync) :
    "Bookings · aucune synchronisation reçue";
  const upcoming = state.bookings.filter(slot=>slot.end > Date.now()).sort((a,b)=>a.start-b.start).slice(0,5);
  $("bookings").replaceChildren(...upcoming.map(slot=>{
    const item = document.createElement("li");
    item.textContent = date.format(slot.start) + " · " + clock.format(slot.start) + " – " + clock.format(slot.end);
    return item;
  }));
  $("bookings").hidden = !upcoming.length;
}
function addSlot(slot = {day:0,start:"08:30",end:"09:20",mode:"class"}) {
  const row = document.createElement("div");
  row.className = "slot";
  row.innerHTML = '<label>Jour <select data-field="day"></select></label><label>Statut <select data-field="mode"><option value="class">En cours</option><option value="available">Disponible</option></select></label><label>Début <input type="time" required data-field="start"></label><label>Fin <input type="time" required data-field="end"></label><div class="actions" data-course-fields style="grid-column: 1 / -1"><label>Nom du cours <input data-field="course" maxlength="60"></label><label>Classe <input data-field="className" maxlength="30"></label></div><button type="button" class="secondary">Retirer</button>';
  const day = row.querySelector('[data-field="day"]');
  weekdays.forEach((name,index)=>day.add(new Option(name,index)));
  for (const control of row.querySelectorAll("[data-field]")) control.value = slot[control.dataset.field] ?? "";
  const mode = row.querySelector('[data-field="mode"]');
  const courseFields = row.querySelector("[data-course-fields]");
  mode.onchange = ()=>{ courseFields.hidden = mode.value !== "class"; };
  mode.onchange();
  row.querySelector("button").onclick = ()=>row.remove();
  $("slots").append(row);
}
function submit(id, handler) {
  $(id).addEventListener("submit",async event=>{
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try { await handler(); }
    catch (error) { $("notice").textContent = error.message; }
    finally { button.disabled = false; }
  });
}
submit("login",async ()=>{
  const key = $("key").value.trim();
  const state = await request("/admin",{token:key});
  token = key;
  $("key").value = "";
  $("weeklyEditor").hidden = true;
  $("weeklySummary").hidden = false;
  const active = state.manual?.until > Date.now() ? state.manual : null;
  $("mode").value = active?.mode || "auto";
  $("message").value = active?.message || "";
  $("course").value = "";
  $("className").value = "";
  updateDuration();
  $("login").hidden = true;
  $("controls").hidden = false;
  $("notice").textContent = demo ? "Démonstration locale · modifications limitées à ce navigateur." : "";
  update(state);
});
submit("manual",async ()=>{
  const mode = $("mode").value;
  const courseDetails = mode === "class" ?
    [$("course").value.trim(), $("className").value.trim()].filter(Boolean).join(" · ") : "";
  const message = [courseDetails, $("message").value.trim()].filter(Boolean).join("\n");
  if (message.length > 160) {
    throw Error("Le cours, la classe et le message doivent totaliser au maximum 160 caractères.");
  }
  const automatic = mode === "auto" && !message;
  const minutes = automatic ? 0 : $("durationHours").valueAsNumber * 60 + $("durationMinutes").valueAsNumber;
  if (!automatic && (!Number.isInteger(minutes) || minutes < 1 || minutes > 240)) {
    throw Error("Choisissez une durée de 1 minute à 4 heures.");
  }
  const state = await request("/manual",{token,method:"PUT",body:{mode,minutes,message}});
  update(state);
  $("notice").textContent = "Statut appliqué.";
});
submit("weekly",async ()=>{
  const slots = [...$("slots").children].map(row=>{
    const values = Object.fromEntries([...row.querySelectorAll("[data-field]")].map(input=>[input.dataset.field,input.value]));
    const {course,className,...fields} = values;
    return {...fields,day:Number(fields.day),...(fields.mode === "class" ?
      {course:course.trim(),className:className.trim()} : {})};
  });
  if (slots.some(s=>s.start >= s.end)) throw Error("La fin doit être après le début pour chaque plage.");
  const state = await request("/slots",{token,method:"PUT",body:slots});
  update(state);
  closeWeeklyEditor();
  $("notice").textContent = "Horaire enregistré.";
});
function updateDuration() {
  $("classDetails").hidden = $("mode").value !== "class";
  const automatic = $("mode").value === "auto" && !$("message").value.trim();
  $("durationLabel").hidden = automatic;
  $("durationHours").disabled = automatic;
  $("durationMinutes").disabled = automatic;
}
$("mode").onchange = updateDuration;
$("message").oninput = updateDuration;
function closeWeeklyEditor() {
  $("weeklyEditor").hidden = true;
  $("weeklySummary").hidden = false;
  $("editWeekly").focus();
}
$("editWeekly").onclick = ()=>{
  $("slots").replaceChildren();
  savedSlots.forEach(addSlot);
  $("weeklySummary").hidden = true;
  $("weeklyEditor").hidden = false;
  $("weeklyEditorTitle").focus();
};
$("backWeekly").onclick = closeWeeklyEditor;
$("add").onclick = ()=>addSlot();
$("logout").onclick = ()=>{
  token = "";
  $("controls").hidden = true;
  $("login").hidden = false;
  $("notice").textContent = "Déconnecté.";
};
if (demo) $("notice").textContent = "Mode démonstration. Saisissez une clé quelconque pour essayer.";
