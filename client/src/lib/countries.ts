/**
 * ISO 3166-1 Alpha-3 country list for foreigner registration (TC11).
 * Grouped: common tourist countries → bilateral treaty countries → all others.
 * CEZIH FHIR uses Alpha-3 codes in address.country.
 */

export interface Country {
    label: string;
    value: string; // Alpha-3
    flag: string;
    isEuEea?: boolean;
}

export interface CountryGroup {
    label: string;
    emoji: string;
    countries: Country[];
}

// EU/EEA/CH/UK countries (eligible for EKZO)
const EU_EEA_VALUES = new Set([
    'AUT', 'BEL', 'BGR', 'CYP', 'CZE', 'DEU', 'DNK', 'EST', 'ESP', 'FIN',
    'FRA', 'GRC', 'HUN', 'IRL', 'ITA', 'LTU', 'LUX', 'LVA', 'MLT', 'NLD',
    'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'SWE',
    // EEA (non-EU)
    'ISL', 'LIE', 'NOR',
    // Special agreements
    'CHE', 'GBR',
]);

export function isEuEea(code: string): boolean {
    return EU_EEA_VALUES.has(code);
}

const COMMON: Country[] = [
    { label: 'Njemačka (DE)', value: 'DEU', flag: '🇩🇪', isEuEea: true },
    { label: 'Austrija (AT)', value: 'AUT', flag: '🇦🇹', isEuEea: true },
    { label: 'Slovenija (SI)', value: 'SVN', flag: '🇸🇮', isEuEea: true },
    { label: 'Italija (IT)', value: 'ITA', flag: '🇮🇹', isEuEea: true },
    { label: 'Poljska (PL)', value: 'POL', flag: '🇵🇱', isEuEea: true },
    { label: 'Češka (CZ)', value: 'CZE', flag: '🇨🇿', isEuEea: true },
    { label: 'Ujedinjeno Kraljevstvo (GB)', value: 'GBR', flag: '🇬🇧', isEuEea: true },
    { label: 'Mađarska (HU)', value: 'HUN', flag: '🇭🇺', isEuEea: true },
    { label: 'Francuska (FR)', value: 'FRA', flag: '🇫🇷', isEuEea: true },
];

const BILATERAL: Country[] = [
    { label: 'Bosna i Hercegovina (BA)', value: 'BIH', flag: '🇧🇦' },
    { label: 'Srbija (RS)', value: 'SRB', flag: '🇷🇸' },
    { label: 'Crna Gora (ME)', value: 'MNE', flag: '🇲🇪' },
    { label: 'Sjeverna Makedonija (MK)', value: 'MKD', flag: '🇲🇰' },
    { label: 'Švicarska (CH)', value: 'CHE', flag: '🇨🇭', isEuEea: true },
];

const OTHER: Country[] = [
    { label: 'Belgija (BE)', value: 'BEL', flag: '🇧🇪', isEuEea: true },
    { label: 'Bugarska (BG)', value: 'BGR', flag: '🇧🇬', isEuEea: true },
    { label: 'Cipar (CY)', value: 'CYP', flag: '🇨🇾', isEuEea: true },
    { label: 'Danska (DK)', value: 'DNK', flag: '🇩🇰', isEuEea: true },
    { label: 'Estonija (EE)', value: 'EST', flag: '🇪🇪', isEuEea: true },
    { label: 'Finska (FI)', value: 'FIN', flag: '🇫🇮', isEuEea: true },
    { label: 'Grčka (GR)', value: 'GRC', flag: '🇬🇷', isEuEea: true },
    { label: 'Irska (IE)', value: 'IRL', flag: '🇮🇪', isEuEea: true },
    { label: 'Island (IS)', value: 'ISL', flag: '🇮🇸', isEuEea: true },
    { label: 'Latvija (LV)', value: 'LVA', flag: '🇱🇻', isEuEea: true },
    { label: 'Lihtenštajn (LI)', value: 'LIE', flag: '🇱🇮', isEuEea: true },
    { label: 'Litva (LT)', value: 'LTU', flag: '🇱🇹', isEuEea: true },
    { label: 'Luksemburg (LU)', value: 'LUX', flag: '🇱🇺', isEuEea: true },
    { label: 'Malta (MT)', value: 'MLT', flag: '🇲🇹', isEuEea: true },
    { label: 'Nizozemska (NL)', value: 'NLD', flag: '🇳🇱', isEuEea: true },
    { label: 'Norveška (NO)', value: 'NOR', flag: '🇳🇴', isEuEea: true },
    { label: 'Portugal (PT)', value: 'PRT', flag: '🇵🇹', isEuEea: true },
    { label: 'Rumunjska (RO)', value: 'ROU', flag: '🇷🇴', isEuEea: true },
    { label: 'Slovačka (SK)', value: 'SVK', flag: '🇸🇰', isEuEea: true },
    { label: 'Španjolska (ES)', value: 'ESP', flag: '🇪🇸', isEuEea: true },
    { label: 'Švedska (SE)', value: 'SWE', flag: '🇸🇪', isEuEea: true },
    // Non-EU/EEA
    { label: 'Albanija (AL)', value: 'ALB', flag: '🇦🇱' },
    { label: 'Australija (AU)', value: 'AUS', flag: '🇦🇺' },
    { label: 'Brazil (BR)', value: 'BRA', flag: '🇧🇷' },
    { label: 'Japan (JP)', value: 'JPN', flag: '🇯🇵' },
    { label: 'Kanada (CA)', value: 'CAN', flag: '🇨🇦' },
    { label: 'Kina (CN)', value: 'CHN', flag: '🇨🇳' },
    { label: 'Rusija (RU)', value: 'RUS', flag: '🇷🇺' },
    { label: 'SAD (US)', value: 'USA', flag: '🇺🇸' },
    { label: 'Turska (TR)', value: 'TUR', flag: '🇹🇷' },
    { label: 'Ukrajina (UA)', value: 'UKR', flag: '🇺🇦' },
];

export const COUNTRY_GROUPS: CountryGroup[] = [
    { label: 'Najčešće države', emoji: '🔝', countries: COMMON },
    { label: 'Bilateralni ugovori', emoji: '🤝', countries: BILATERAL },
    { label: 'Ostale države', emoji: '🌍', countries: OTHER },
];

/** All countries flat */
export const ALL_COUNTRIES: Country[] = [...COMMON, ...BILATERAL, ...OTHER];

/** Find country by alpha-3 code */
export function findCountry(code: string): Country | undefined {
    return ALL_COUNTRIES.find(c => c.value === code);
}

/** Validation regexes */
export const PASSPORT_REGEX = /^[A-Za-z0-9]{5,20}$/;
export const EKZO_REGEX = /^[A-Za-z0-9]{1,20}$/;
