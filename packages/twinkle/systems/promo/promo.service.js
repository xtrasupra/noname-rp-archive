const promoConfig = require("../../configs/promo.config.js");

const {
  withConn,
  getPromoByCode,
  createPromoCode,
  getCharacterPromoInfo,
  applyPromoToCharacter,
  giveCharacterReward,
  setPromoRewarded,
  addPromoRewardedCount,
  getPromoStatsByOwner,
  getAllPromoStats
} = require("../../database/query.js");

function getCharacterUuid(player) {
  return player.characterUuid || player.character_uuid || player.uuid;
}

async function checkPromoReward(player) {
  const characterUuid = getCharacterUuid(player);
  if (!characterUuid) return;

  await withConn(async (conn) => {
    const character = await getCharacterPromoInfo(characterUuid, conn);
    if (!character) return;

    if (!character.promo_code) return;
    if (character.promo_rewarded === 1) return;
    if (character.level < promoConfig.rewardLevel) return;

    const promo = await getPromoByCode(character.promo_code, conn);
    if (!promo) return;

    const rewards = promoConfig.rewards[promo.type];
    if (!rewards) return;

    await giveCharacterReward(characterUuid, rewards.player, conn);

    if (
      promo.type === "player" &&
      promo.owner_character_uuid &&
      Number(promo.owner_character_uuid) !== Number(characterUuid)
    ) {
      await giveCharacterReward(promo.owner_character_uuid, rewards.owner, conn);
    }

    await setPromoRewarded(characterUuid, conn);
    await addPromoRewardedCount(promo.id, conn);

    player.outputChatBox(`!{#5eff5e}Вы получили награду за промокод ${promo.code}`);
  });
}

module.exports = {
  getCharacterUuid,
  checkPromoReward
};