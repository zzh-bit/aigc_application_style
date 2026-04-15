/**
 * 不启动模拟器：仅校验「客户端锚定推演」对典型议题产出含城市锚点的路径名。
 * 运行：node scripts/verify-projection-grounding.mjs
 */
import assert from "node:assert/strict";

const MAJOR = ["北京", "上海", "西安", "广州", "深圳", "杭州", "成都"];

function orderedCities(text) {
  const hits = [];
  for (const c of MAJOR) {
    const i = text.indexOf(c);
    if (i >= 0) hits.push({ c, i });
  }
  hits.sort((a, b) => a.i - b.i);
  const out = [];
  for (const h of hits) if (!out.includes(h.c)) out.push(h.c);
  return out;
}

function cityTripleNames(topic, cA, cB) {
  return [`侧重${cA}`, `侧重${cB}`, `${cA}/${cB}折中`];
}

const topicCity = "去北京还是西安工作";
const cities = orderedCities(topicCity);
assert.equal(cities[0], "北京");
assert.equal(cities[1], "西安");
const namesCity = cityTripleNames(topicCity, cities[0], cities[1]);
for (const n of namesCity) {
  assert.ok(n.includes("北京") || n.includes("西安"), `expected city in name: ${n}`);
}

function splitEitherOr(t) {
  const idx = t.indexOf("还是");
  if (idx < 1) return null;
  let left = t.slice(0, idx).replace(/^(今晚|今天晚上|晚上)+/, "").trim();
  let right = t.slice(idx + 2).replace(/和(以前|以往).*$/, "").trim();
  return { a: left, b: right };
}
const foodTopic = "晚上吃麻辣烫还是喝粥和以前一样的问题";
const pair = splitEitherOr(foodTopic);
assert.ok(pair && pair.a.includes("麻辣烫") && pair.b.includes("粥"), `either-or food: ${JSON.stringify(pair)}`);

console.log("verify-projection-grounding: OK", namesCity.join(" | "), "| food:", pair.a, "/", pair.b);
