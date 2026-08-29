'use client';

import React from 'react';

interface OfferButtonProps {
  href: string;
  label: string;
  brand?: string;
  slot?: string;
  price?: string;
  className?: string;
}

export function warmAffiliateConnections(hosts: string[] = []) {
  if (typeof window === 'undefined') return;
  const defaultHosts = [
    'https://www.tkqlhce.com',
    'https://www.dpbolvw.net',
    'https://www.anrdoezrs.net',
    'https://www.jdoqocy.com',
    'https://achadinhos-ad-engine.vercel.app'
  ];
  const allHosts = Array.from(new Set([...defaultHosts, ...hosts]));

  allHosts.forEach((host) => {
    if (!document.querySelector(`link[rel="preconnect"][href="${host}"]`)) {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = host;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }
  });
}

export const OfferButton: React.FC<OfferButtonProps> = ({
  href,
  label,
  brand = 'NordVPN',
  slot = 'inline',
  price,
  className = ''
}) => {
  const handleClick = () => {
    warmAffiliateConnections();
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="sponsored noopener noreferrer nofollow"
      onClick={handleClick}
      className={`inline-flex items-center justify-center px-6 py-3.5 text-base font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl transition duration-150 shadow-lg shadow-blue-500/25 ${className}`}
    >
      <span>{label}</span>
      {price && <span className="ml-2 text-xs bg-blue-800/80 px-2.5 py-1 rounded-md font-mono">{price}</span>}
    </a>
  );
};
