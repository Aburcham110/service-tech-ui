import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { callOpen, appendNote, treeNote, toolNote } from "../tools/call-notes.js";
import { TREES, chooseTree, treeHref } from "../tools/trees.js";

test("call open only when the draft has typed content", () => {
  assert.equal(callOpen(null), false);
  assert.equal(callOpen({ step: "open", techName: "Arthur", startTime: "08:00", equipment: "cooler", photosReady: false, partsList: "[]", site: "" }), false);
  assert.equal(callOpen({ equipment: "split" }), true);
  assert.equal(callOpen({ site: "Store 12" }), true);
  assert.equal(callOpen({ partsList: '[{"part":"x"}]' }), true);
});

test("append to Found on its own line; empty text is a no-op", () => {
  assert.equal(appendNote({ found: "" }, "A").found, "A");
  assert.equal(appendNote({ found: "Iced coil  \n" }, "B").found, "Iced coil\nB");
  assert.equal(appendNote({ found: "x", site: "S" }, "  ").found, "x");
  assert.equal(appendNote({ site: "S" }, "C").site, "S");
});

test("tree and tool notes", () => {
  const id = Object.keys(TREES)[0], t = TREES[id];
  let path = [t.start];
  for (let i = 0; i < 20; i++) { const n = t.nodes[path.at(-1)]; if (n.end || !n.options || !n.options.length) break; const o = n.options.find((x) => x.next); if (!o) break; path.push(o.next); }
  const note = treeNote(t, path);
  assert.ok(note.startsWith("Troubleshooting — " + t.title + ": "));
  if (path.length > 1) assert.match(note, /→/);
  assert.equal(treeNote(t, []), "");
  assert.equal(toolNote("SH / Subcool", "Superheat: 9.6 °F\n\nSubcooling: 10.1 °F"), "SH / Subcool: Superheat: 9.6 °F · Subcooling: 10.1 °F");
  assert.equal(toolNote("X", ""), "");
});

test("troubleshooting button picks the tree for the equipment type", () => {
  assert.equal(treeHref(chooseTree({ equipment: "split" })), "tree.html?type=split-ac-hp");
  assert.equal(treeHref(chooseTree({ equipment: "RTU" })), "tree.html?type=rtu");
  assert.equal(treeHref(chooseTree({ equipment: "mini-split" })), "tree.html?type=mini-split");
  assert.equal(treeHref(chooseTree({ equipment: "freezer" })), "tree.html?type=walk-in");
  assert.equal(chooseTree({ equipment: "other" }), null);
  assert.equal(chooseTree({ equipment: "split", unitType: "compressor" }), "compressor"); // plate data wins
});

test("wired + precached", () => {
  assert.ok(readFileSync(new URL("../tools/tree-app.js", import.meta.url), "utf8").includes("mountAddToCall"));
  assert.ok(readFileSync(new URL("../tools/tool-app.js", import.meta.url), "utf8").includes("mountAddToCall"));
  assert.ok(readFileSync(new URL("../sw.js", import.meta.url), "utf8").includes('"./tools/call-notes.js?v=42"'));
});
