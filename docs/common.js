import { apiBase } from "./config.js";
export const labels = {available:"Disponible",class:"En cours",meeting:"En rendez-vous",away:"Indisponible",reunion:"En réunion",support:"En dépannage dans un autre local",timetable:"Au local Horaires",unknown:"Statut indisponible"};
export const zone = "Europe/Brussels";
export const clock = new Intl.DateTimeFormat("fr-BE",{timeZone:zone,hour:"2-digit",minute:"2-digit"});
export const date = new Intl.DateTimeFormat("fr-BE",{timeZone:zone,dateStyle:"full"});
export const demo = !apiBase;
const demoKey = "availability-demo-v1";
export async function request(path, options = {}) {
  if (demo) {
    const state = JSON.parse(localStorage.getItem(demoKey) || '{"slots":[],"manual":null}');
    if (options.method === "PUT") {
      if (path === "/slots") state.slots = options.body;
      if (path === "/manual") {
        const {mode, minutes, message} = options.body;
        state.manual = mode === "auto" && !message ? null :
          {mode,message,until:Date.now() + minutes * 60000};
      }
      localStorage.setItem(demoKey,JSON.stringify(state));
    }
    return {...state, bookings:[], sync:null};
  }
  const headers = {};
  if (options.token) headers.Authorization = "Bearer " + options.token;
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(apiBase + path,{
    method:options.method || "GET", headers, cache:"no-store",
    body:options.body ? JSON.stringify(options.body) : undefined,
    signal:AbortSignal.timeout(8000)
  });
  if (!response.ok) throw Error(response.status === 401 ? "Clé de pilotage incorrecte." :
    response.status === 400 ? "Vérifiez les horaires saisis." : "Le service est momentanément inaccessible.");
  return response.json();
}
