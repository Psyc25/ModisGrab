import { HabitsData, CalculationResult } from '../types';
import { PAHE_MAX_TRIPS, PAHE_SUBSCRIPTION_FEE, paheDiscountFor, COMMUTE_DAYS_PER_MONTH, BOROS_THRESHOLDS } from '../config/campaign';

/** Nilai tengah perjalanan GrabBike per hari untuk tiap pilihan jawaban. */
export const BIKE_TRIPS_PER_DAY: Record<string, number> = {
  '1–2 kali': 1.5,
  '3–4 kali': 3.5,
  '5–6 kali': 5.5,
  '7+ kali': 7,
};

/** Perkiraan ongkos sekali jalan untuk tiap pilihan jawaban. */
export const TRIP_COST: Record<string, number> = {
  '≤ Rp9rb': 9000,
  '≈ Rp15rb': 15000,
  '≈ Rp20rb': 20000,
  'Rp25rb+': 25000,
};

export const BIKE_OPTIONS = Object.keys(BIKE_TRIPS_PER_DAY);
export const COST_OPTIONS = Object.keys(TRIP_COST);

export function calculateBoros(habits: HabitsData): CalculationResult {
  // Jumlah rides sehari diketik manual (angka). Jawaban lama berupa rentang tetap dibaca sebagai nilai tengah.
  const typed = Number(String(habits.dailyBikeTrips).replace(',', '.').replace(/[^0-9.]/g, ''));
  const tripsPerDay = BIKE_TRIPS_PER_DAY[habits.dailyBikeTrips] ?? (Number.isFinite(typed) ? Math.min(30, Math.max(0, typed)) : 0);
  const tripsPerMonth = Math.round(tripsPerDay * COMMUTE_DAYS_PER_MONTH);

  const costPerTripNormal = TRIP_COST[habits.avgTripCost] ?? 0;
  // PAHE: Rp1.500 off bila ongkos <= Rp9.000, Rp1.000 off bila lebih; maks. 99x per bulan
  const paheDiscount = Math.min(paheDiscountFor(costPerTripNormal), costPerTripNormal);
  const costPerTripPahe = Math.max(0, costPerTripNormal - paheDiscount);
  const eligibleTrips = Math.min(tripsPerMonth, PAHE_MAX_TRIPS);

  const monthlyCostNormal = tripsPerMonth * costPerTripNormal;
  const monthlySavings = eligibleTrips * paheDiscount;
  const monthlyCostPahe = Math.max(0, monthlyCostNormal - monthlySavings);
  const subscriptionFee = PAHE_SUBSCRIPTION_FEE;
  const netSavingsAfterTrial = monthlySavings - subscriptionFee;

  // Status boros dari besarnya ongkos GrabBike sebulan (bukan dari potensi hemat)
  let borosStatus: CalculationResult['borosStatus'];
  if (monthlyCostNormal >= BOROS_THRESHOLDS.sangatBoros) borosStatus = 'Sangat Boros';
  else if (monthlyCostNormal >= BOROS_THRESHOLDS.boros) borosStatus = 'Boros';
  else if (monthlyCostNormal >= BOROS_THRESHOLDS.lumayanBoros) borosStatus = 'Lumayan Boros';
  else borosStatus = 'Cukup Hemat';

  return {
    tripsPerMonth,
    costPerTripNormal,
    costPerTripPahe,
    paheDiscount,
    eligibleTrips,
    subscriptionFee,
    netSavingsAfterTrial,
    monthlyCostNormal,
    monthlyCostPahe,
    monthlySavings,
    borosStatus,
  };
}

