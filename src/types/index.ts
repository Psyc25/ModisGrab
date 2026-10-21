export interface SPGConfig {
  poiLocation: string;
  poiCategory: 'Station' | 'Campus' | 'HOP & Public Space' | 'Office';
  unitType: 'Mobil Diskon' | 'Kiosk 1' | 'Kiosk 2';
  spgName: string;
  /** Jam jaga, format HH:MM (24 jam) */
  dutyStart: string;
  dutyEnd: string;
  /** Tanggal (YYYY-MM-DD, waktu perangkat) saat SPG terakhir memulai tugas */
  dutyDate: string;
  targetLeadsPerShift?: number;
}

export type AgeGroup = '<18' | '18-24' | '25-34' | '35+';

export interface VisitorFormData {
  ageGroup: AgeGroup | '';
  isMinor: boolean;
  fullName: string;
  email: string;
  phoneNumber: string;
  privacyAgreed: boolean;
  previousStamps?: number;
  isReturningVisitor?: boolean;
  claimedToday?: boolean;
}

export interface HabitsData {
  dailyBikeTrips: string; // angka rides per hari yang diketik SPG, mis. "4"
  avgTripCost: string; // "≤ Rp9rb", "≈ Rp15rb", "≈ Rp20rb", "Rp25rb+"
}

export interface CalculationResult {
  tripsPerMonth: number;
  costPerTripNormal: number;
  /** Ongkos per perjalanan setelah potongan PAHE. */
  costPerTripPahe: number;
  /** Potongan PAHE per perjalanan (Rp). */
  paheDiscount: number;
  /** Perjalanan yang dapat potongan (maks. PAHE_MAX_TRIPS). */
  eligibleTrips: number;
  /** Biaya langganan PAHE per bulan (bulan pertama gratis). */
  subscriptionFee: number;
  /** Hemat bersih bulan berikutnya = potensi hemat - biaya langganan. */
  netSavingsAfterTrial: number;
  monthlyCostNormal: number;
  monthlyCostPahe: number;
  monthlySavings: number;
  borosStatus: 'Sangat Boros' | 'Boros' | 'Lumayan Boros' | 'Cukup Hemat';
}

export interface VisitorRecord {
  id: string;
  created_at: string;
  /** Tidak lagi ditanyakan; hanya terisi pada data lama. */
  ageGroup: AgeGroup | null;
  isMinor: boolean;
  fullName: string;
  email: string;
  phoneNumber: string;
  privacyAgreed: boolean;
  consentVersion: string;
  // Kebiasaan
  dailyBikeTrips: string;
  avgTripCost: string;
  // Kalkulasi Hasil
  monthlyTrips: number;
  monthlyCostNormal: number;
  costPerTripPahe: number;
  monthlySavings: number;
  borosStatus: string;
  stampsCount: number;
  rewardClaimed?: string;
  // Data lokasi & SPG
  poiLocation: string;
  poiCategory?: string;
  unitType: string;
  spgName: string;
  /** Jam jaga SPG saat visitor diinput, mis. "07:00–09:30" */
  dutyHours?: string;
  deviceId?: string;
  /** Nomor WA tersamar, disimpan di perangkat setelah nomor asli dihapus */
  phoneMasked?: string;
  syncedToSupabase: boolean;
  /** true bila nama/email/WA sudah dihapus dari perangkat setelah tersinkron */
  piiPurged?: boolean;
}

export interface MerchInventoryItem {
  id: string;
  name: string;
  category: 'Sarapan' | 'Merchandise' | 'Grand Prize';
  stock: number;
  initialStock: number;
  probabilityWeight: number;
}
