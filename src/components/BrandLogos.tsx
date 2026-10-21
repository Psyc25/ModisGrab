import React from 'react';
import { brand } from '../assets/brand';

/**
 * Logo Grab dari deck proposal. Gambar aslinya putih; warna lain dibuat lewat CSS mask
 * supaya bentuk huruf tetap persis sama dengan logo resmi.
 */
export const GrabOfficialLogo: React.FC<{ className?: string; color?: string }> = ({
  className = 'h-6',
  color = '#00B14F',
}) => (
  <span
    role="img"
    aria-label="Grab"
    className={`inline-block aspect-[126/44] ${className}`}
    style={{
      backgroundColor: color,
      WebkitMaskImage: `url(${brand.grabWordmarkWhite})`,
      maskImage: `url(${brand.grabWordmarkWhite})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }}
  />
);

/** Logo MODIS "The Daily Savings Pit-Stop" dari deck. */
export const ModisProposalLogo: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = ({
  size = 'md',
  className = '',
}) => {
  const w = size === 'sm' ? 'w-32' : size === 'lg' ? 'w-72' : 'w-52';
  return (
    <img
      src={brand.modisLogo}
      alt="Grab MODIS – The Daily Savings Pit-Stop"
      className={`${w} h-auto select-none drop-shadow-[0_4px_10px_rgba(0,0,0,0.25)] ${className}`}
      draggable={false}
    />
  );
};

/** Lencana "Hemat Setiap Hari" dari deck (halaman key message). */
export const HematSetiapHariBanner: React.FC<{ className?: string }> = ({ className = 'w-28' }) => (
  <img src={brand.hematSetiapHari} alt="Hemat setiap hari" className={`h-auto select-none ${className}`} draggable={false} />
);

export const PaheLogo: React.FC<{ className?: string }> = ({ className = 'w-20' }) => (
  <img src={brand.paheLogo} alt="PAHE Paket Hemat" className={`h-auto select-none ${className}`} draggable={false} />
);
