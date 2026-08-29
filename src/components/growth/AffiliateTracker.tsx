'use client';

import { useEffect } from 'react';
import { warmAffiliateConnections } from './OfferButton';

interface AffiliateTrackerProps {
  datasetHosts?: string[];
  site?: string;
  slot?: string;
}

export const AffiliateTracker: React.FC<AffiliateTrackerProps> = ({
  datasetHosts = [],
  site = 'nexus',
  slot = 'global'
}) => {
  useEffect(() => {
    warmAffiliateConnections(datasetHosts);

    // Global click delegation to ensure all sponsored links have proper rel and tracking
    const handleGlobalClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target || !target.href) return;

      const isAffiliate =
        target.href.includes('tkqlhce.com') ||
        target.href.includes('dpbolvw.net') ||
        target.href.includes('anrdoezrs.net') ||
        target.href.includes('jdoqocy.com') ||
        target.href.includes('/api/ads/go');

      if (isAffiliate) {
        if (!target.getAttribute('rel')?.includes('sponsored')) {
          target.setAttribute('rel', 'sponsored noopener noreferrer nofollow');
        }
      }
    };

    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [datasetHosts, site, slot]);

  return null;
};
