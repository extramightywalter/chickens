import assert from "node:assert/strict";
import test from "node:test";
import { createShop, ITEMS, outcomeReward, placeReward, rivalGameRoundReward, validAppearance } from "../js/shop.js";
import { createGame } from "../js/lobby.js";
import { SHOP_DESK } from "../js/track.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("the desk opens only when the lobby player is close enough", () => {
  const game = createGame();
  assert.equal(game.nearShop(), false);
  Object.assign(game.state, { x: SHOP_DESK.x + SHOP_DESK.halfWidth + 1, z: SHOP_DESK.z });
  assert.equal(game.nearShop(), true);
  game.state.z = SHOP_DESK.z + SHOP_DESK.halfDepth + 3;
  assert.equal(game.nearShop(), false);
  game.enterTrack();
  assert.equal(game.nearShop(), false);
});

test("purchases, equipment, and rewards persist and cannot be duplicated", () => {
  const storage = memoryStorage();
  let shop = createShop(storage);
  assert.equal(shop.coins, 0);
  assert.deepEqual(shop.owned.sort(), ["blue", "gamer", "green", "headphones", "purple", "red"]);
  assert.equal(shop.buy("cap"), false);
  assert.equal(shop.equip("cap"), false);
  assert.equal(shop.reward("round-1", 25), true);
  assert.equal(shop.reward("round-1", 25), false);
  assert.equal(shop.buy("cap"), true);
  assert.equal(shop.buy("cap"), false);
  assert.equal(shop.buy("cyan"), true);
  assert.equal(shop.buy("orange"), false);
  assert.equal(shop.equip("cap"), true);
  assert.equal(shop.equip("cyan"), true);
  assert.equal(shop.equip("gamer"), true);
  shop = createShop(storage);
  assert.equal(shop.coins, 0);
  assert.deepEqual(shop.appearance, { color: "cyan", hat: "cap", clothing: "gamer" });
  assert.equal(shop.reward("round-1", 25), false);
  shop.equip("cap");
  assert.equal(shop.appearance.hat, null);
});

test("rewards follow human-player counts and appearance values are validated", () => {
  assert.deepEqual([1, 2, 3].map(place => placeReward(2, place)), [1, 0, 0]);
  assert.deepEqual([1, 2, 3].map(place => placeReward(3, place)), [2, 1, 0]);
  assert.deepEqual([1, 2, 3, 4].map(place => placeReward(4, place)), [3, 2, 1, 0]);
  assert.equal(placeReward(8, 3), 1);
  assert.equal(placeReward(4, 0), 0);
  assert.equal(outcomeReward(2, 1, 1, 2), 1);
  assert.equal(outcomeReward(3, 1, 2, 3), 2);
  assert.equal(outcomeReward(2, 1, 0, 2), 0);
  assert.equal(outcomeReward(2, 1, 2, 2), 0);
  assert.equal(validAppearance({ color: "blue", hat: "headphones", clothing: null }), true);
  assert.equal(validAppearance({ color: "cap", hat: null, clothing: null }), false);
  assert.equal(ITEMS.orange.price, 5);
});

test("rival game outcomes never award coins", () => {
  assert.equal(rivalGameRoundReward(true), "Win: no coins awarded");
  assert.equal(rivalGameRoundReward(false), "Rival wins: no coins awarded");
  assert.equal(rivalGameRoundReward(null), "Draw: no coins awarded");
});

test("a failed storage write does not update the in-memory balance", () => {
  const shop = createShop({ getItem: () => null, setItem: () => { throw new Error("storage full"); } });
  assert.throws(() => shop.reward("round", 3), /storage full/);
  assert.equal(shop.coins, 0);
});
