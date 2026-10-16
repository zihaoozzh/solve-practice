// Vocabulario de cada escenario ecológico, en español e inglés.
// Los números (rangos de población, variables) son comunes: la misma semilla da el mismo escenario en ambos idiomas.

import type { Lang } from '../lib/history';

export interface EnvVar {
  label: string;
  unit: string;
  min: number;
  max: number;
  decimals: number;
}

interface ThemeText {
  region: string;
  species: string; // plural, minúsculas
  unitWord: string;
  juveniles: string;
  program: string; // "el programa de ..." / "the ... program"
  programCap: string;
  siteA: string;
  siteB: string;
  /** Sitio fuera del área de estudio (para anexos distractores sin contradecir el texto). */
  siteC: string;
  censusName: string;
  monitoringName: string;
  cohortName: string;
  envLabels: [string, string];
  envUnits: [string, string];
  rateMetric: string; // en español, femenina ("la tasa...")
  subAreas: string[];
  plotWord: string; // en español, femenino
  plotPlural: string;
  facts: [{ label: string; unit: string; text: string }, { label: string; unit: string; text: string }];
}

interface ThemeDef {
  key: string;
  nameEs: string;
  popA: [number, number];
  popB: [number, number]; // en miles
  env: [Omit<EnvVar, 'label' | 'unit'>, Omit<EnvVar, 'label' | 'unit'>];
  facts: [{ min: number; max: number; decimals: number }, { min: number; max: number; decimals: number }];
  text: Record<Lang, ThemeText>;
}

/** Tema ya resuelto en un idioma: lo que usan los generadores. */
export interface Theme extends Omit<ThemeText, 'envLabels' | 'envUnits' | 'facts'> {
  key: string;
  nameEs: string;
  lang: Lang;
  popA: [number, number];
  popB: [number, number];
  envVars: EnvVar[];
  extraFacts: { label: string; unit: string; min: number; max: number; decimals: number; text: string }[];
}

export function localizeTheme(def: ThemeDef, lang: Lang): Theme {
  const t = def.text[lang];
  return {
    ...t,
    key: def.key,
    nameEs: def.nameEs,
    lang,
    popA: def.popA,
    popB: def.popB,
    envVars: def.env.map((e, i) => ({ ...e, label: t.envLabels[i], unit: t.envUnits[i] })),
    extraFacts: def.facts.map((f, i) => ({ ...f, ...t.facts[i] })),
  };
}

export const THEME_DEFS: ThemeDef[] = [
  {
    key: 'reef',
    nameEs: 'Recuperación de un arrecife',
    popA: [1200, 4800],
    popB: [2.4, 9.6],
    env: [
      { min: 26, max: 30, decimals: 1 },
      { min: 8, max: 22, decimals: 1 },
    ],
    facts: [
      { min: 180, max: 950, decimals: 0 },
      { min: 14, max: 60, decimals: 0 },
    ],
    text: {
      es: {
        region: 'Bahía Casandra',
        species: 'colonias de coral ramificado',
        unitWord: 'colonias',
        juveniles: 'colonias de menos de 5 cm',
        program: 'el programa de trasplante de coral',
        programCap: 'El programa de trasplante de coral',
        siteA: 'Arrecife Farol',
        siteB: 'Bajo Brisa',
        siteC: 'Cala Serena',
        censusName: 'Censo anual del arrecife',
        monitoringName: 'Conteos de transectos de buceo en primavera',
        cohortName: 'Lote de trasplante',
        envLabels: ['Temperatura media del mar en superficie', 'Visibilidad media del agua'],
        envUnits: ['°C', 'm'],
        rateMetric: 'incidencia de blanqueamiento',
        subAreas: ['Talud exterior', 'Borde de la laguna', 'Canal', 'Arrecife posterior'],
        plotWord: 'parcela de arrecife',
        plotPlural: 'parcelas de arrecife',
        facts: [
          { label: 'Presupuesto del programa', unit: 'miles de USD', text: 'el presupuesto fue de' },
          { label: 'Buceadores voluntarios', unit: 'buceadores', text: 'participaron como voluntarios' },
        ],
      },
      en: {
        region: 'Cassander Bay',
        species: 'branching coral colonies',
        unitWord: 'colonies',
        juveniles: 'colonies under 5 cm',
        program: 'the coral transplant program',
        programCap: 'The coral transplant program',
        siteA: 'Lantern Reef',
        siteB: 'Brisa Shoal',
        siteC: 'Serena Cove',
        censusName: 'Annual reef census',
        monitoringName: 'Spring dive transect counts',
        cohortName: 'Transplant batch',
        envLabels: ['Mean sea surface temperature', 'Mean water visibility'],
        envUnits: ['°C', 'm'],
        rateMetric: 'bleaching incidence',
        subAreas: ['Outer slope', 'Lagoon edge', 'Channel', 'Back reef'],
        plotWord: 'reef plot',
        plotPlural: 'reef plots',
        facts: [
          { label: 'Program budget', unit: 'USD thousand', text: 'the budget was' },
          { label: 'Volunteer divers', unit: 'divers', text: 'the volunteer team numbered' },
        ],
      },
    },
  },
  {
    key: 'lake',
    nameEs: 'Peces en un lago de montaña',
    popA: [900, 4200],
    popB: [2.1, 8.8],
    env: [
      { min: 9, max: 16, decimals: 1 },
      { min: 6, max: 11, decimals: 1 },
    ],
    facts: [
      { min: 120, max: 900, decimals: 0 },
      { min: 1600, max: 2700, decimals: 0 },
    ],
    text: {
      es: {
        region: 'Lago Orvane',
        species: 'salvelinos alpinos',
        unitWord: 'peces',
        juveniles: 'alevines de menos de 1 año',
        program: 'el programa de restauración de gravas de desove',
        programCap: 'El programa de restauración de gravas de desove',
        siteA: 'Cuenca Norte',
        siteB: 'Cuenca Sur',
        siteC: 'Laguna Alta',
        censusName: 'Censo anual con redes de enmalle',
        monitoringName: 'Estimaciones de verano con ecosonda',
        cohortName: 'Lote de repoblación',
        envLabels: ['Temperatura media del agua en verano', 'Oxígeno disuelto a 10 m'],
        envUnits: ['°C', 'mg/L'],
        rateMetric: 'tasa de éxito de desove',
        subAreas: ['Bahía de entrada', 'Fosa profunda', 'Plataforma rocosa', 'Estrecho de salida'],
        plotWord: 'zona de muestreo',
        plotPlural: 'zonas de muestreo',
        facts: [
          { label: 'Grava colocada', unit: 'toneladas', text: 'las cuadrillas colocaron un total de' },
          { label: 'Altitud del lago', unit: 'm', text: 'el lago está a una altitud de' },
        ],
      },
      en: {
        region: 'Lake Orvane',
        species: 'alpine char',
        unitWord: 'fish',
        juveniles: 'fry under 1 year',
        program: 'the spawning-gravel restoration program',
        programCap: 'The spawning-gravel restoration program',
        siteA: 'North Basin',
        siteB: 'South Basin',
        siteC: 'High Tarn',
        censusName: 'Annual gill-net census',
        monitoringName: 'Summer echo-sounder estimates',
        cohortName: 'Stocking batch',
        envLabels: ['Mean summer water temperature', 'Dissolved oxygen at 10 m'],
        envUnits: ['°C', 'mg/L'],
        rateMetric: 'spawning success rate',
        subAreas: ['Inlet bay', 'Deep trench', 'Rocky shelf', 'Outlet narrows'],
        plotWord: 'sampling zone',
        plotPlural: 'sampling zones',
        facts: [
          { label: 'Gravel placed', unit: 'tonnes', text: 'crews placed a total of' },
          { label: 'Lake elevation', unit: 'm', text: 'the lake sits at an elevation of' },
        ],
      },
    },
  },
  {
    key: 'desert',
    nameEs: 'Plantas en un desierto',
    popA: [1500, 6000],
    popB: [3.2, 11.5],
    env: [
      { min: 90, max: 260, decimals: 0 },
      { min: 21, max: 34, decimals: 1 },
    ],
    facts: [
      { min: 40, max: 320, decimals: 0 },
      { min: 4, max: 28, decimals: 1 },
    ],
    text: {
      es: {
        region: 'Llanos de Acedera',
        species: 'arbustos de palo fierro',
        unitWord: 'plantas',
        juveniles: 'plántulas de menos de 30 cm',
        program: 'el programa de diques de captación de lluvia',
        programCap: 'El programa de diques de captación de lluvia',
        siteA: 'Mesa Este',
        siteB: 'Mesa Oeste',
        siteC: 'Mesa Sur',
        censusName: 'Censo anual de vegetación',
        monitoringName: 'Conteos de copas con dron en otoño',
        cohortName: 'Lote de plantación',
        envLabels: ['Precipitación anual', 'Temperatura media del suelo'],
        envUnits: ['mm', '°C'],
        rateMetric: 'tasa de supervivencia de plántulas',
        subAreas: ['Lecho seco', 'Terraza de grava', 'Margen de dunas', 'Afloramiento rocoso'],
        plotWord: 'parcela de estudio',
        plotPlural: 'parcelas de estudio',
        facts: [
          { label: 'Diques construidos', unit: 'diques', text: 'se construyeron' },
          { label: 'Longitud de diques', unit: 'km', text: 'la longitud total de los diques alcanzó' },
        ],
      },
      en: {
        region: 'Sorrel Flats',
        species: 'desert ironwood shrubs',
        unitWord: 'plants',
        juveniles: 'seedlings under 30 cm',
        program: 'the rainwater-harvesting berm program',
        programCap: 'The rainwater-harvesting berm program',
        siteA: 'East Mesa',
        siteB: 'West Mesa',
        siteC: 'South Mesa',
        censusName: 'Annual vegetation census',
        monitoringName: 'Autumn drone canopy counts',
        cohortName: 'Planting batch',
        envLabels: ['Annual rainfall', 'Mean soil temperature'],
        envUnits: ['mm', '°C'],
        rateMetric: 'seedling survival rate',
        subAreas: ['Wash bed', 'Gravel terrace', 'Dune margin', 'Rock outcrop'],
        plotWord: 'study plot',
        plotPlural: 'study plots',
        facts: [
          { label: 'Berms built', unit: 'berms', text: 'crews built' },
          { label: 'Berm length', unit: 'km', text: 'combined berm length reached' },
        ],
      },
    },
  },
  {
    key: 'birds',
    nameEs: 'Migración de aves',
    popA: [700, 3600],
    popB: [1.8, 7.4],
    env: [
      { min: 1.2, max: 3.8, decimals: 1 },
      { min: 2, max: 19, decimals: 0 },
    ],
    facts: [
      { min: 3, max: 18, decimals: 0 },
      { min: 300, max: 2400, decimals: 0 },
    ],
    text: {
      es: {
        region: 'Estuario de Halvard',
        species: 'chorlitejos grandes',
        unitWord: 'aves',
        juveniles: 'aves de primer año',
        program: 'el programa de construcción de islas de nidificación',
        programCap: 'El programa de construcción de islas de nidificación',
        siteA: 'Marisma Interior',
        siteB: 'Flecha Exterior',
        siteC: 'Islote del Faro',
        censusName: 'Censo anual de reproductores',
        monitoringName: 'Conteos de escala migratoria en otoño',
        cohortName: 'Cohorte anillada',
        envLabels: ['Altura media de la marea viva de primavera', 'Avistamientos de depredadores por semana'],
        envUnits: ['m', 'avistamientos'],
        rateMetric: 'tasa de éxito de nidificación',
        subAreas: ['Banco de guijarros', 'Pradera salina', 'Borde del fangal', 'Cresta de la isla'],
        plotWord: 'unidad censal',
        plotPlural: 'unidades censales',
        facts: [
          { label: 'Islas construidas', unit: 'islas', text: 'se construyeron' },
          { label: 'Horas de observación', unit: 'horas', text: 'los equipos de campo registraron un total de' },
        ],
      },
      en: {
        region: 'Halvard Estuary',
        species: 'ringed plovers',
        unitWord: 'birds',
        juveniles: 'first-year birds',
        program: 'the nesting-island construction program',
        programCap: 'The nesting-island construction program',
        siteA: 'Inner Marsh',
        siteB: 'Outer Spit',
        siteC: 'Lighthouse Islet',
        censusName: 'Annual breeding census',
        monitoringName: 'Autumn stopover counts',
        cohortName: 'Ringing cohort',
        envLabels: ['Mean spring tide height', 'Predator sightings per week'],
        envUnits: ['m', 'sightings'],
        rateMetric: 'nest success rate',
        subAreas: ['Shingle bank', 'Salt meadow', 'Mudflat edge', 'Island crest'],
        plotWord: 'census unit',
        plotPlural: 'census units',
        facts: [
          { label: 'Islands built', unit: 'islands', text: 'crews built' },
          { label: 'Observer hours', unit: 'hours', text: 'field teams logged a total of' },
        ],
      },
    },
  },
  {
    key: 'pond',
    nameEs: 'Anfibios en charcas restauradas',
    popA: [600, 3200],
    popB: [1.5, 6.6],
    env: [
      { min: 5.8, max: 7.9, decimals: 1 },
      { min: 120, max: 380, decimals: 0 },
    ],
    facts: [
      { min: 6, max: 40, decimals: 0 },
      { min: 200, max: 1800, decimals: 0 },
    ],
    text: {
      es: {
        region: 'Turbera de Merrow',
        species: 'tritones moteados',
        unitWord: 'tritones',
        juveniles: 'tritones juveniles',
        program: 'el programa de restauración de charcas',
        programCap: 'El programa de restauración de charcas',
        siteA: 'Charcas del Aliso',
        siteB: 'Charcas del Carrizal',
        siteC: 'Charcas del Molino',
        censusName: 'Censo anual con trampas de caída',
        monitoringName: 'Conteos nocturnos con linterna',
        cohortName: 'Cohorte de cría asistida',
        envLabels: ['pH medio de las charcas', 'Lluvia de primavera'],
        envUnits: ['unidades de pH', 'mm'],
        rateMetric: 'tasa de supervivencia larvaria',
        subAreas: ['Charca 1', 'Charca 2', 'Charca 3', 'Charca 4'],
        plotWord: 'charca de muestreo',
        plotPlural: 'charcas de muestreo',
        facts: [
          { label: 'Charcas excavadas', unit: 'charcas', text: 'se excavaron' },
          { label: 'Vallado instalado', unit: 'm', text: 'el vallado para anfibios instalado sumó' },
        ],
      },
      en: {
        region: 'Merrow Fen',
        species: 'spotted newts',
        unitWord: 'newts',
        juveniles: 'juvenile newts',
        program: 'the pond restoration program',
        programCap: 'The pond restoration program',
        siteA: 'Alder Ponds',
        siteB: 'Reedmere Ponds',
        siteC: 'Millrace Ponds',
        censusName: 'Annual pitfall-trap census',
        monitoringName: 'Night torch-survey counts',
        cohortName: 'Head-start cohort',
        envLabels: ['Mean pond pH', 'Spring rainfall'],
        envUnits: ['pH units', 'mm'],
        rateMetric: 'larval survival rate',
        subAreas: ['Pond 1', 'Pond 2', 'Pond 3', 'Pond 4'],
        plotWord: 'survey pond',
        plotPlural: 'survey ponds',
        facts: [
          { label: 'Ponds dug', unit: 'ponds', text: 'crews dug' },
          { label: 'Fencing installed', unit: 'm', text: 'amphibian fencing installed totalled' },
        ],
      },
    },
  },
];

/** Compatibilidad: temas en español. */
export const THEMES: Theme[] = THEME_DEFS.map((d) => localizeTheme(d, 'es'));
