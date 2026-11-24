import {request,labels,clock,date,demo} from "./common.js";
import {currentStatus} from "./status.js?v=edition-creneaux";
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
const preferredSlot = slots => slots.find(slot => slot.mode === "class") ||
  slots.find(slot => slot.mode !== "available") || slots[0];
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
      const button = document.createElement("button");
      button.type = "button";
      button.className = "timetable-edit";
      button.id = "slot-" + day + "-" + index;
      button.setAttribute("aria-haspopup","dialog");

      const daily = slots.filter(slot => slot.day === day && slot.start < end && slot.end > start);
      const boundaries = [...new Set([start,end,...daily.flatMap(slot =>
        [slot.start,slot.end].filter(time => start < time && time < end))])].sort();
      button.onclick = () => openSlot({day,start,end}, preferredSlot(daily), button.id);
      const blocks = [];
      boundaries.slice(0,-1).forEach((from,i)=>{
        const to = boundaries[i+1];
        const active = daily.filter(slot => slot.start <= from && slot.end >= to);
        const slot = preferredSlot(active);
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
        button.append(block);
      }
      button.setAttribute("aria-label", [weekdays[day], formatTime(start) + " – " + formatTime(end), button.innerText || blocks.map(({slot})=>labels[slot?.mode || "away"]).join(", ")].join(", "));
      cell.append(button);
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
const dialog = $("slotDialog");
const slotMode = $("slotMode");
for (const option of $("mode").options) {
  if (option.value !== "auto") slotMode.add(option.cloneNode(true));
}
let selection;
let returnFocus;
let saving = false;

function updateSlotFields() {
  $("slotClassDetails").hidden = slotMode.value !== "class";
  $("slotMessageLabel").hidden = slotMode.value === "auto";
}

function openSlot(window, slot, buttonId) {
  selection = window;
  returnFocus = buttonId;
  $("slotTitle").textContent = weekdays[window.day] + " · " +
    formatTime(window.start) + " – " + formatTime(window.end);
  slotMode.value = slot?.mode || "auto";
  $("slotCourse").value = slot?.course || "";
  $("slotClass").value = slot?.className || "";
  $("slotMessage").value = slot?.message || "";
  $("slotError").textContent = "";
  updateSlotFields();
  dialog.showModal();
}
slotMode.onchange = updateSlotFields;
$("cancelSlot").onclick = () => dialog.close();
dialog.addEventListener("cancel", event => { if (saving) event.preventDefault(); });
dialog.addEventListener("close", () => $(returnFocus)?.focus());

function replaceSlot(slots, window, fields) {
  const {day,start,end} = window;
  const remaining = slots.flatMap(slot => {
    if (slot.day !== day || slot.end <= start || slot.start >= end) return [slot];
    const edges = [];
    if (slot.start < start) edges.push({...slot,end:start});
    if (slot.end > end) edges.push({...slot,start:end});
    return edges;
  });
  if (fields.mode !== "auto") remaining.unshift({...window,...fields});
  return remaining;
}

$("slotForm").onsubmit = async event => {
  event.preventDefault();
  if (saving) return;
  saving = true;
  const buttons = [$("saveSlot"), $("cancelSlot")];
  buttons.forEach(button => button.disabled = true);
  $("slotError").textContent = "";
  const mode = slotMode.value;
  const fields = {mode,message:$("slotMessage").value.trim()};
  if (mode === "class") {
    fields.course = $("slotCourse").value.trim();
    fields.className = $("slotClass").value.trim();
  }
  try {
    const current = await request("/admin",{token});
    const slots = replaceSlot(current.slots,selection,fields);
    const state = await request("/slots",{token,method:"PUT",body:slots});
    update(state);
    dialog.close();
    $("notice").textContent = "Créneau enregistré.";
  } catch (error) {
    $("slotError").textContent = error.message;
  } finally {
    saving = false;
    buttons.forEach(button => button.disabled = false);
  }
};
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
function updateDuration() {
  $("classDetails").hidden = $("mode").value !== "class";
  const automatic = $("mode").value === "auto" && !$("message").value.trim();
  $("durationLabel").hidden = automatic;
  $("durationHours").disabled = automatic;
  $("durationMinutes").disabled = automatic;
}
$("mode").onchange = updateDuration;
$("message").oninput = updateDuration;
$("logout").onclick = ()=>{
  token = "";
  $("controls").hidden = true;
  $("login").hidden = false;
  $("notice").textContent = "Déconnecté.";
};
if (demo) $("notice").textContent = "Mode démonstration. Saisissez une clé quelconque pour essayer.";
