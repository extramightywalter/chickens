export const ITEMS = {
  red: { name: "Red", type: "color", color: 0xd62828 },
  green: { name: "Green", type: "color", color: 0x2ecc71 },
  blue: { name: "Blue", type: "color", color: 0x3498db },
  purple: { name: "Purple", type: "color", color: 0x9b59b6 },
  orange: { name: "Orange", type: "color", color: 0xe67e22, price: 5 },
  cyan: { name: "Cyan", type: "color", color: 0x1abcde, price: 8 },
  headphones: { name: "Headphones", type: "hat" },
  cap: { name: "Baseball cap", type: "hat", price: 17 },
  gamer: { name: "Gamer T", type: "clothing" },
  jersey: { name: "Pitcher's jersey", type: "clothing", price: 18 },
};
const STARTER_ITEMS = Object.keys(ITEMS).filter(id => ITEMS[id].price === undefined);
const STORAGE_KEY = "chicken-shop-v1";
export const DEFAULT_APPEARANCE = Object.freeze({ color: "blue", hat: null, clothing: null });

export function validAppearance(appearance) {
  return appearance && typeof appearance === "object" &&
    ITEMS[appearance.color]?.type === "color" &&
    (appearance.hat === null || ITEMS[appearance.hat]?.type === "hat") &&
    (appearance.clothing === null || ITEMS[appearance.clothing]?.type === "clothing");
}

export function createShop(storage) {
  const saved = storage.getItem(STORAGE_KEY);
  let data = saved === null ? {
    coins: 0, owned: [...STARTER_ITEMS], appearance: { ...DEFAULT_APPEARANCE },
    rewardedRounds: [],
  } : JSON.parse(saved);
  if (!Number.isSafeInteger(data.coins) || data.coins < 0 || !Array.isArray(data.owned) ||
      !STARTER_ITEMS.every(id => data.owned.includes(id)) ||
      !data.owned.every(id => Object.hasOwn(ITEMS, id)) || !validAppearance(data.appearance) ||
      !Object.values(data.appearance).every(id => id === null || data.owned.includes(id)) ||
      !Array.isArray(data.rewardedRounds) || !data.rewardedRounds.every(id => typeof id === "string")) {
    throw new Error("Saved shop data is invalid.");
  }
  function save(next) {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    data = next;
  }
  return {
    get coins() { return data.coins; },
    get owned() { return [...data.owned]; },
    get appearance() { return { ...data.appearance }; },
    buy(id) {
      const item = ITEMS[id];
      if (!item || item.price === undefined || data.owned.includes(id) || data.coins < item.price) return false;
      save({ ...data, coins: data.coins - item.price, owned: [...data.owned, id] });
      return true;
    },
    equip(id) {
      const item = ITEMS[id];
      if (!item || !data.owned.includes(id)) return false;
      const value = item.type !== "color" && data.appearance[item.type] === id ? null : id;
      save({ ...data, appearance: { ...data.appearance, [item.type]: value } });
      return true;
    },
    reward(roundId, amount) {
      if (typeof roundId !== "string" || !roundId || !Number.isSafeInteger(amount) || amount < 0) {
        throw new Error("Invalid round reward.");
      }
      if (data.rewardedRounds.includes(roundId)) return false;
      save({ ...data, coins: data.coins + amount, rewardedRounds: [...data.rewardedRounds, roundId] });
      return true;
    },
  };
}

export function placeReward(playerCount, place) {
  if (!Number.isInteger(place) || place < 1 || place > playerCount) return 0;
  if (playerCount === 2) return place === 1 ? 1 : 0;
  if (playerCount === 3) return place === 1 ? 2 : place === 2 ? 1 : 0;
  if (playerCount >= 4 && playerCount <= 8) return Math.max(0, 4 - place);
  return 0;
}

export function outcomeReward(playerCount, place, winnerCount, racerCount) {
  if (!Number.isInteger(playerCount) || !Number.isInteger(winnerCount) ||
      !Number.isInteger(racerCount) || winnerCount === 0 || winnerCount === racerCount) return 0;
  return placeReward(playerCount, place);
}
