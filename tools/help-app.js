/** help.html: opens the section named in the URL hash, lists the real tools, wires Send feedback. */
import { TOOLS } from "./registry.js";
import { sendFeedback, MAX_FEEDBACK } from "./feedback.js?v=36";

function openHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const d = id && document.getElementById(id);
  if (d && d.tagName === "DETAILS") { d.open = true; d.scrollIntoView({ block: "start" }); }
}
openHash();
window.addEventListener("hashchange", openHash);

const ul = document.getElementById("help-tools");
for (const t of TOOLS) {
  const li = document.createElement("li");
  const a = document.createElement("a"); a.href = "tool.html?id=" + encodeURIComponent(t.id); a.textContent = t.title;
  li.append(a, document.createTextNode(": " + (t.useWhen || "")));
  ul.appendChild(li);
}

const form = document.getElementById("feedback-form");
const msg = document.getElementById("feedback-msg");
const count = document.getElementById("feedback-count");
const status = document.getElementById("feedback-status");
msg.maxLength = MAX_FEEDBACK;
const upd = () => { count.textContent = msg.value.length + " / " + MAX_FEEDBACK; };
msg.addEventListener("input", upd); upd();
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await sendFeedback(msg.value);
  status.textContent = { sent: "✓ Sent. Thanks!", queued: "Queued. It sends when you're back online.", empty: "Type a message first.", unset: "Feedback isn't set up." }[r];
  if (r === "sent" || r === "queued") { msg.value = ""; upd(); }
});
