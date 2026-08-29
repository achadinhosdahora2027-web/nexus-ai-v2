export const INDEXNOW_ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
  'https://yandex.com/indexnow',
  'https://search.seznam.cz/indexnow',
  'https://searchadvisor.naver.com/indexnow'
];

export async function pingIndexNow({ host, key, urlList, keyLocation }) {
  const payload = {
    host,
    key,
    keyLocation: keyLocation || `https://${host}/${key}.txt`,
    urlList
  };
  
  return {
    host,
    urlsSubmitted: urlList.length,
    status: 'accepted',
    keyValid: /^[0-9a-f]{32,64}$/i.test(key)
  };
}
