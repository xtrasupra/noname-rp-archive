"use strict";

const CONDO_DIMENSION_BASE = 1_000_000;
const INTERACTION_DISTANCE = 2.5;
const configuredRefundPercent = Number(process.env.CONDO_SELL_REFUND_PERCENT ?? 70);
const SELL_REFUND_PERCENT = Number.isFinite(configuredRefundPercent)
  ? Math.max(0, Math.min(100, configuredRefundPercent))
  : 70;

// The ids match condos.interior and the legacy house/condo interior catalog.
const INTERIORS = [
  [1973.087, 3816.231, 32.42871, 32.09988],
  [1973.087, 3816.231, 32.42871, 32.09988],
  [151.33824, -1007.64196, -100.0, -0.800103],
  [-1908.757, -572.6663, 18.10679, -123.2994],
  [265.15405, -1000.99035, -100.01189, 1.40028],
  [-1150.627, -1520.831, 9.63272, 42.19985],
  [346.52127, -1002.45306, -100.19626, 1.699997],
  [-14.2267, -1440.357, 30.10154, 6.423715],
  [7.74072, 538.5586, 175.0281, 158.1992],
  [-815.6338, 178.5606, 71.15309, -62.49992],
  [-777.3342, 323.6484, 210.9974, -89.99999],
  [-758.5388, 619.0275, 143.159, 115.8703],
  [-1289.856, 449.4803, 96.90755, -180.0],
  [-781.7711, 318.185, 216.6389, 0.0],
  [-777.33831, 340.02807, 206.62086, 93.02799],
  [980.438720703125, 56.759857177734375, 115.1641845703125, 56.140254974365234],
  [373.4725646972656, 423.40234375, 144.9078826904297, 169.2933807373047],
  [341.7474670410156, 437.6512145996094, 148.39407348632812, 115.6588134765625],
  [117.16754913330078, 559.5700073242188, 183.30487060546875, 188.30841064453125],
  [-174.2841339111328, 497.3167419433594, 136.66693115234375, 192.0149688720703],
  [-571.9983520507812, 661.6953735351562, 144.83985900878906, 165.8435821533203],
  [-682.216796875, 592.0908813476562, 144.39306640625, 223.222900390625],
  [-859.8622436523438, 690.9188842773438, 151.86073303222656, 187.37477111816406],
];

function getCondoDimension(condoId) {
  const id = Number(condoId);
  return Number.isInteger(id) && id > 0 ? CONDO_DIMENSION_BASE + id : 0;
}

function getCondoInterior(interiorId) {
  const id = Number(interiorId);
  const coords = Number.isInteger(id) ? INTERIORS[id] : null;

  if (!coords) return null;

  return {
    id,
    x: Number(coords[0]),
    y: Number(coords[1]),
    z: Number(coords[2]),
    heading: Number(coords[3] || 0),
  };
}

module.exports = {
  CONDO_DIMENSION_BASE,
  INTERACTION_DISTANCE,
  INTERIORS,
  SELL_REFUND_PERCENT,
  getCondoDimension,
  getCondoInterior,
};
