import { isAllowedHost, parseDomainList } from './core.js';

export const AGAGHHH_PRIMARY_DOMAIN_KEY = 'x1080x-ex:agaghhh-primary-domain';
export const DEFAULT_AGAGHHH_PRIMARY_DOMAIN = '1080xin.com';
export const LEGACY_AGAGHHH_DOMAIN = 'agaghhh.cc';

export function parseAgaghhhPrimaryDomain(value) {
  const domains = parseDomainList(value);
  if (domains.length !== 1) return '';
  const host = domains[0];
  if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host)) return '';
  return host;
}

export function getAgaghhhPrimaryDomain() {
  const stored = typeof GM_getValue === 'function'
    ? GM_getValue(AGAGHHH_PRIMARY_DOMAIN_KEY, DEFAULT_AGAGHHH_PRIMARY_DOMAIN)
    : DEFAULT_AGAGHHH_PRIMARY_DOMAIN;
  return parseAgaghhhPrimaryDomain(stored) || DEFAULT_AGAGHHH_PRIMARY_DOMAIN;
}

export function getAgaghhhDomains() {
  return [...new Set([
    getAgaghhhPrimaryDomain(),
    DEFAULT_AGAGHHH_PRIMARY_DOMAIN,
    LEGACY_AGAGHHH_DOMAIN,
  ])];
}

export function isAgaghhhHost(locationObject = globalThis.location) {
  const host = typeof locationObject === 'string' ? locationObject : locationObject?.hostname;
  return isAllowedHost(host, getAgaghhhDomains());
}

export function getAgaghhhOrigin() {
  return `https://${getAgaghhhPrimaryDomain()}`;
}

export function toAgaghhhPrimaryUrl(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || !isAgaghhhHost(url)) return '';
    return new URL(url.pathname + url.search + url.hash, getAgaghhhOrigin()).href;
  } catch {
    return '';
  }
}
