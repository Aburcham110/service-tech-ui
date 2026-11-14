/** "OEM manuals" card (manuals.html): official manual links for the model on screen, from the bundled
 *  data/manual-index.json. Links open the OEM's own site in a new tab; nothing is downloaded, proxied or cached. */
import { matchManuals, NO_MATCH_TEXT } from "./manual-match.js?v=45";

export const CARD_TITLE = "OEM manuals";
export const CARD_NOTE = "Official OEM links from the Model Manual Index (opens online). Educational only — verify with OEM.";

/** View model: null when no model is set (card hidden). */
export function oemCard(index, { brand, model } = {}) {
  if (!String(model || "").trim()) return null;
  const rows = matchManuals(index, { brand, model });
  return { title: CARD_TITLE, note: CARD_NOTE, rows, empty: rows.length ? "" : NO_MATCH_TEXT };
}

/** Renders the card into host (or hides it). doc is injectable for tests. */
export function renderOemCard(host, index, input, doc = host.ownerDocument) {
  const card = oemCard(index, input);
  host.textContent = "";
  host.hidden = !card;
  if (!card) return null;
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  host.appendChild(el("h2", null, card.title));
  if (!card.rows.length) host.appendChild(el("p", "oem-empty", card.empty));
  else {
    const ul = el("ul", "oem-list");
    for (const r of card.rows) {
      const li = el("li", r.nonOem ? "oem-not-oem" : null);
      const a = el("a", "oem-link");
      a.href = r.url; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.appendChild(el("strong", null, r.brand + " — " + r.docTitle));
      a.appendChild(el("small", "oem-meta", " " + r.label + " · verified " + r.verifiedDate));
      li.appendChild(a); ul.appendChild(li);
    }
    host.appendChild(ul);
  }
  host.appendChild(el("p", "footer-note", card.note));
  return card;
}
