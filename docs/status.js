const parts = new Intl.DateTimeFormat("en-GB",{
  timeZone:"Europe/Brussels",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
});
const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
export function currentStatus(data, now = new Date()) {
  const manual = data.manual?.until > +now ? data.manual : null;
  const message = manual?.message ? {message:manual.message,messageUntil:manual.until} : {};
  if (manual && manual.mode !== "auto") return {mode:manual.mode,until:manual.until,...message};
  return {...scheduledStatus(data,now),...message};
}

function scheduledStatus(data, now) {
  const activeBookings = data.bookings.filter(item => item.start <= +now && +now < item.end);
  if (activeBookings.length) return {
    mode:"meeting",
    names:[...new Set(activeBookings.flatMap(item=>item.names || []))],
    until:Math.min(...activeBookings.map(item=>item.end))
  };
  const {weekday,hour,minute} = Object.fromEntries(parts.formatToParts(now).map(p=>[p.type,p.value]));
  const time = hour + ":" + minute;
  const slots = data.slots.filter(item => item.day === days.indexOf(weekday) && item.start <= time && time < item.end);
  if (slots.some(item=>item.mode === "class")) return {mode:"class"};
  if (slots.some(item=>item.mode === "available")) return {mode:"available"};
  return {mode:"away"};
}
