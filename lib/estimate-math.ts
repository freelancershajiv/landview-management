export const FT_TO_M = 0.3048;

export const safe = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

export const kgPerMeter = (diameterMm: number) => {
  const d = safe(diameterMm);
  return d ? (d * d) / 162 : 0;
};

export const withWaste = (quantity: number, wastePct = 0) => safe(quantity) * (1 + safe(wastePct) / 100);

export const meshSteelKg = (input: {
  lengthFt: number;
  widthFt: number;
  diaXmm: number;
  spacingXIn: number;
  diaYmm: number;
  spacingYIn: number;
  layers?: number;
  wastePct?: number;
}) => {
  const lengthFt = safe(input.lengthFt);
  const widthFt = safe(input.widthFt);
  const sx = safe(input.spacingXIn);
  const sy = safe(input.spacingYIn);
  if (!lengthFt || !widthFt || !sx || !sy) return 0;
  const barsX = Math.floor((widthFt * 12) / sx) + 1;
  const barsY = Math.floor((lengthFt * 12) / sy) + 1;
  const xLengthM = barsX * lengthFt * FT_TO_M;
  const yLengthM = barsY * widthFt * FT_TO_M;
  const kg = (xLengthM * kgPerMeter(input.diaXmm) + yLengthM * kgPerMeter(input.diaYmm)) * Math.max(1, safe(input.layers || 1));
  return withWaste(kg, input.wastePct || 0);
};

export const longitudinalSteelKg = (lengthFt: number, barCount: number, diameterMm: number, wastePct = 0) =>
  withWaste(safe(lengthFt) * FT_TO_M * safe(barCount) * kgPerMeter(diameterMm), wastePct);

export const stirrupSteelKg = (input: {
  memberLengthFt: number;
  widthIn: number;
  depthIn: number;
  diameterMm: number;
  spacingIn: number;
  coverIn?: number;
  wastePct?: number;
}) => {
  const lengthFt = safe(input.memberLengthFt);
  const spacingIn = safe(input.spacingIn);
  if (!lengthFt || !spacingIn) return 0;
  const cover = safe(input.coverIn || 0);
  const widthIn = Math.max(0, safe(input.widthIn) - 2 * cover);
  const depthIn = Math.max(0, safe(input.depthIn) - 2 * cover);
  const oneStirrupM = (2 * (widthIn + depthIn) / 12) * FT_TO_M;
  const count = Math.floor((lengthFt * 12) / spacingIn) + 1;
  return withWaste(oneStirrupM * count * kgPerMeter(input.diameterMm), input.wastePct || 0);
};

export const pileQuantities = (input: {
  count: number;
  diameterIn: number;
  lengthFt: number;
  mainBars: number;
  mainDiaMm: number;
  spiralDiaMm: number;
  spiralSpacingIn: number;
  coverIn?: number;
  wastePct?: number;
}) => {
  const count = safe(input.count);
  const diameterFt = safe(input.diameterIn) / 12;
  const lengthFt = safe(input.lengthFt);
  const concreteCft = count * Math.PI * diameterFt * diameterFt / 4 * lengthFt;
  const mainKg = longitudinalSteelKg(lengthFt * count, input.mainBars, input.mainDiaMm, input.wastePct || 0);
  const spacingFt = safe(input.spiralSpacingIn) / 12;
  const coreDiaFt = Math.max(0, diameterFt - (2 * safe(input.coverIn || 0)) / 12);
  let spiralKg = 0;
  if (count && lengthFt && spacingFt && coreDiaFt) {
    const turnsPerPile = Math.floor(lengthFt / spacingFt) + 1;
    const helixFt = Math.sqrt(Math.pow(Math.PI * coreDiaFt, 2) + Math.pow(spacingFt, 2));
    spiralKg = withWaste(count * turnsPerPile * helixFt * FT_TO_M * kgPerMeter(input.spiralDiaMm), input.wastePct || 0);
  }
  return { concreteCft, mainKg, spiralKg, steelKg: mainKg + spiralKg, boringRft: count * lengthFt };
};

export const footingQuantities = (input: {
  count: number;
  lengthFt: number;
  widthFt: number;
  thicknessIn: number;
  excavationDepthFt: number;
  workingSpaceFt?: number;
  pccThicknessIn?: number;
  diaXmm: number;
  spacingXIn: number;
  diaYmm: number;
  spacingYIn: number;
  meshLayers?: number;
  wastePct?: number;
}) => {
  const count = safe(input.count);
  const l = safe(input.lengthFt);
  const w = safe(input.widthFt);
  const tFt = safe(input.thicknessIn) / 12;
  const ws = safe(input.workingSpaceFt || 0);
  const excavationCft = count * (l + 2 * ws) * (w + 2 * ws) * safe(input.excavationDepthFt);
  const pccCft = count * l * w * (safe(input.pccThicknessIn || 0) / 12);
  const concreteCft = count * l * w * tFt;
  const steelKg = count * meshSteelKg({
    lengthFt: l,
    widthFt: w,
    diaXmm: input.diaXmm,
    spacingXIn: input.spacingXIn,
    diaYmm: input.diaYmm,
    spacingYIn: input.spacingYIn,
    layers: input.meshLayers || 1,
    wastePct: input.wastePct || 0,
  });
  const formworkSft = count * 2 * (l + w) * tFt;
  const backfillCft = Math.max(0, excavationCft - pccCft - concreteCft);
  return { excavationCft, pccCft, concreteCft, steelKg, formworkSft, backfillCft };
};

export const beamQuantities = (input: {
  lengthFt: number;
  widthIn: number;
  depthIn: number;
  topBars: number;
  bottomBars: number;
  mainDiaMm: number;
  stirrupDiaMm: number;
  stirrupSpacingIn: number;
  coverIn?: number;
  wastePct?: number;
}) => {
  const lengthFt = safe(input.lengthFt);
  const widthFt = safe(input.widthIn) / 12;
  const depthFt = safe(input.depthIn) / 12;
  const concreteCft = lengthFt * widthFt * depthFt;
  const mainKg = longitudinalSteelKg(lengthFt, safe(input.topBars) + safe(input.bottomBars), input.mainDiaMm, input.wastePct || 0);
  const stirrupKg = stirrupSteelKg({ memberLengthFt: lengthFt, widthIn: input.widthIn, depthIn: input.depthIn, diameterMm: input.stirrupDiaMm, spacingIn: input.stirrupSpacingIn, coverIn: input.coverIn || 0, wastePct: input.wastePct || 0 });
  const formworkSft = lengthFt * (2 * depthFt + widthFt);
  return { concreteCft, mainKg, stirrupKg, steelKg: mainKg + stirrupKg, formworkSft };
};

export const columnQuantities = (input: {
  count: number;
  heightFt: number;
  widthIn: number;
  depthIn: number;
  mainBars: number;
  mainDiaMm: number;
  tieDiaMm: number;
  tieSpacingIn: number;
  coverIn?: number;
  wastePct?: number;
}) => {
  const count = safe(input.count);
  const heightFt = safe(input.heightFt);
  const widthFt = safe(input.widthIn) / 12;
  const depthFt = safe(input.depthIn) / 12;
  const concreteCft = count * heightFt * widthFt * depthFt;
  const mainKg = longitudinalSteelKg(heightFt * count, input.mainBars, input.mainDiaMm, input.wastePct || 0);
  const tieKg = count * stirrupSteelKg({ memberLengthFt: heightFt, widthIn: input.widthIn, depthIn: input.depthIn, diameterMm: input.tieDiaMm, spacingIn: input.tieSpacingIn, coverIn: input.coverIn || 0, wastePct: input.wastePct || 0 });
  const formworkSft = count * heightFt * 2 * (widthFt + depthFt);
  return { concreteCft, mainKg, tieKg, steelKg: mainKg + tieKg, formworkSft };
};

export const slabQuantities = (input: {
  lengthFt: number;
  widthFt: number;
  thicknessIn: number;
  diaXmm: number;
  spacingXIn: number;
  diaYmm: number;
  spacingYIn: number;
  layers?: number;
  wastePct?: number;
}) => {
  const lengthFt = safe(input.lengthFt);
  const widthFt = safe(input.widthFt);
  return {
    areaSft: lengthFt * widthFt,
    concreteCft: lengthFt * widthFt * safe(input.thicknessIn) / 12,
    steelKg: meshSteelKg({ lengthFt, widthFt, diaXmm: input.diaXmm, spacingXIn: input.spacingXIn, diaYmm: input.diaYmm, spacingYIn: input.spacingYIn, layers: input.layers || 1, wastePct: input.wastePct || 0 }),
    formworkSft: lengthFt * widthFt,
  };
};

export const amount = (quantity: number, materialRate: number, labourRate = 0) => safe(quantity) * (safe(materialRate) + safe(labourRate));
