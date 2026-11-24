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
const schoolTimes = ["08:15","09:05","09:55","10:40","10:55","11:45",
  "12:30","13:15","14:05","14:55","15:45"];
const formatTime = time => time.replace(":", " h ");

function renderTimetable(slots) {
  const rows = schoolTimes.slice(0,-1).map((start,index)=>{
    const end = schoolTimes[index + 1];
    const row = document.createElement("tr");
    const heading = document.createElement("th");
    heading.scope = "row";
    heading.textContent = formatTime(start) + " – " + formatTime(end);
    row.append(heading);

    weekdays.slice(0,5).forEach((_,day)=>{
      const cell = row.insertCell();
      const daily = slots.filter(slot => slot.day === day && slot.start < end && slot.end > start);
      const boundaries = [...new Set([start,end,...daily.flatMap(slot =>
        [slot.start,slot.end].filter(time => start < time && time < end))])].sort();
      const blocks = [];
      boundaries.slice(0,-1).forEach((from,i)=>{
        const to = boundaries[i+1];
        const active = daily.filter(slot => slot.start <= from && slot.end >= to);
        const slot = active.find(slot => slot.mode === "class") || active.find(slot => slot.mode === "available");
        const previous = blocks.at(-1);
        if (previous && previous.slot === slot) previous.to = to;
        else blocks.push({from,to,slot});
      });
      for (const {from,to,slot} of blocks) {
        const block = document.createElement("div");
        block.className = "timetable-block";
        block.dataset.mode = slot?.mode || "away";
        const label = document.createElement("strong");
        label.textContent = labels[block.dataset.mode];
        block.append(label);
        if (slot?.mode === "class") {
          const details = [slot.course,slot.className].filter(Boolean).join(" · ");
          if (details) {
            const caption = document.createElement("span");
            caption.textContent = details;
            block.append(caption);
          }
        }
        if (blocks.length > 1) {
          const time = document.createElement("small");
          time.textContent = formatTime(from) + " – " + formatTime(to);
          block.append(time);
        }
        cell.append(block);
      }
    });
    return row;
  });
  $("weeklyRows").replaceChildren(...rows);
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
function addSlot(slot = {day:0,start:"08:15",end:"09:05",mode:"class"}) {
  const row = document.createElement("div");
  row.className = "slot";
  row.innerHTML = '<label>Jour <select data-field="day"></select></label><label>Statut <select data-field="mode"><option value="class">En cours</option><option value="available">Disponible</option></select></label><label>Début <select required data-field="start"></select></label><label>Fin <select required data-field="end"></select></label><div class="actions" data-course-fields style="grid-column: 1 / -1"><label>Nom du cours (facultatif) <input data-field="course" maxlength="60"></label><label>Classe (facultatif) <input data-field="className" maxlength="30"></label></div><button type="button" class="secondary">Retirer</button>';
  const day = row.querySelector('[data-field="day"]');
  weekdays.forEach((name,index)=>day.add(new Option(name,index)));
  for (const field of ["start","end"]) {
    const menu = row.querySelector('[data-field="' + field + '"]');
    const times = schoolTimes.filter((_,i)=>field === "start" ? i < schoolTimes.length-1 : i > 0);
    for (const time of times) menu.add(new Option(formatTime(time),time));
    if (!times.includes(slot[field])) {
      menu.add(new Option(formatTime(slot[field]) + " (horaire existant)",slot[field]));
    }
  }
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
