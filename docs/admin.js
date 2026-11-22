import {request,labels,clock,date,demo} from "./common.js";
import {currentStatus} from "./status.js";
const $ = id => document.getElementById(id);
const weekdays = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
let token = "";
function update(state) {
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
  row.innerHTML = '<label>Jour <select data-field="day"></select></label><label>Début <input type="time" required data-field="start"></label><label>Fin <input type="time" required data-field="end"></label><label>Statut <select data-field="mode"><option value="class">En cours</option><option value="available">Disponible</option></select></label><button type="button" class="secondary">Retirer</button>';
  const day = row.querySelector('[data-field="day"]');
  weekdays.forEach((name,index)=>day.add(new Option(name,index)));
  for (const control of row.querySelectorAll("[data-field]")) control.value = slot[control.dataset.field];
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
  $("slots").replaceChildren();
  state.slots.forEach(addSlot);
  const active = state.manual?.until > Date.now() ? state.manual : null;
  $("mode").value = active?.mode || "auto";
  $("message").value = active?.message || "";
  updateDuration();
  $("login").hidden = true;
  $("controls").hidden = false;
  $("notice").textContent = demo ? "Démonstration locale · modifications limitées à ce navigateur." : "";
  update(state);
});
submit("manual",async ()=>{
  const state = await request("/manual",{token,method:"PUT",body:{mode:$("mode").value,minutes:Number($("duration").value),message:$("message").value.trim()}});
  update(state);
  $("notice").textContent = "Statut appliqué.";
});
submit("weekly",async ()=>{
  const slots = [...$("slots").children].map(row=>{
    const values = Object.fromEntries([...row.querySelectorAll("[data-field]")].map(input=>[input.dataset.field,input.value]));
    return {...values,day:Number(values.day)};
  });
  if (slots.some(s=>s.start >= s.end)) throw Error("La fin doit être après le début pour chaque plage.");
  const state = await request("/slots",{token,method:"PUT",body:slots});
  update(state);
  $("notice").textContent = "Horaire enregistré.";
});
function updateDuration() {
  $("durationLabel").hidden = $("mode").value === "auto" && !$("message").value.trim();
}
$("mode").onchange = updateDuration;
$("message").oninput = updateDuration;
$("add").onclick = ()=>addSlot();
$("logout").onclick = ()=>{
  token = "";
  $("controls").hidden = true;
  $("login").hidden = false;
  $("notice").textContent = "Déconnecté.";
};
if (demo) $("notice").textContent = "Mode démonstration. Saisissez une clé quelconque pour essayer.";
